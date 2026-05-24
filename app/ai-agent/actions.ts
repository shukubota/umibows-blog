"use server";

import { runAgent } from "@/lib/agent/loop";
import { AgentError } from "@/lib/agent/errors";
import type { Message } from "@/lib/agent/types";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface SendMessageResult {
  ok: boolean;
  reply?: string;
  error?: string;
  usage?: { input_tokens: number; output_tokens: number };
  turns?: number;
}

function toMessages(history: ChatTurn[], next: string): Message[] {
  const msgs: Message[] = history.map((t) => ({
    role: t.role,
    content: [{ type: "text", text: t.text }],
  }));
  msgs.push({ role: "user", content: [{ type: "text", text: next }] });
  return msgs;
}

export async function sendMessage(
  history: ChatTurn[],
  input: string
): Promise<SendMessageResult> {
  if (!input.trim()) {
    return { ok: false, error: "input is empty" };
  }
  try {
    const result = await runAgent(toMessages(history, input));
    return {
      ok: true,
      reply: result.text,
      usage: result.usage,
      turns: result.turns,
    };
  } catch (e) {
    if (e instanceof AgentError) {
      return { ok: false, error: `${e.code}: ${e.message}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
