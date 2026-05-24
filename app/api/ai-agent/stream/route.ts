import { NextRequest } from "next/server";
import { runAgentStream } from "@/lib/agent/loop-stream";
import { bootstrapAll } from "@/lib/agent/bootstrap";
import { loadSkills } from "@/lib/skills/loader";
import { selectSkill } from "@/lib/skills/selector";
import { runSkill } from "@/lib/skills/runner";
import { defaultDispatcher } from "@/lib/agent/dispatcher";
import { logger } from "@/lib/agent/logger";
import type { Message, StreamEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  history: { role: "user" | "assistant"; text: string }[];
  input: string;
  sessionId?: string;
  useSkill?: boolean;
}

function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function toMessages(
  history: { role: "user" | "assistant"; text: string }[],
  next: string
): Message[] {
  const msgs: Message[] = history.map((t) => ({
    role: t.role,
    content: [{ type: "text", text: t.text }],
  }));
  msgs.push({ role: "user", content: [{ type: "text", text: next }] });
  return msgs;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }
  if (!body.input?.trim()) {
    return new Response(JSON.stringify({ error: "input is empty" }), { status: 400 });
  }

  await bootstrapAll();

  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (ev: StreamEvent) => controller.enqueue(enc.encode(sseEncode(ev)));

      try {
        let selectedSkillName: string | undefined;
        let result;
        if (body.useSkill !== false) {
          try {
            const skills = await loadSkills();
            const selection = await selectSkill(body.input, skills);
            if (selection.skill) {
              selectedSkillName = selection.skill.manifest.name;
              logger.info({ skill: selectedSkillName, reason: selection.reason }, "skill.selected");
              const gen = (async function* () {
                const exec = await runSkill({
                  skill: selection.skill!,
                  input: toMessages(body.history, body.input),
                  dispatcher: defaultDispatcher,
                });
                yield { type: "done", result: exec } as StreamEvent;
              })();
              for await (const ev of gen) send(ev);
              controller.close();
              return;
            }
          } catch (e) {
            logger.warn({ err: String(e) }, "skill.select_failed");
          }
        }

        for await (const ev of runAgentStream(toMessages(body.history, body.input), {
          sessionId: body.sessionId,
          signal: ac.signal,
        })) {
          send(ev);
          if (ev.type === "done" || ev.type === "error") {
            result = ev;
          }
        }
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: "error", message: msg });
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
