import { complete } from "@/lib/llm/claude";
import { AgentError } from "./errors";
import { ToolDispatcher, defaultDispatcher } from "./dispatcher";
import { logger } from "./logger";
import config from "@/agent.config";
import type {
  ContentBlock,
  Message,
  RunOptions,
  RunResult,
  ToolResultBlock,
  ToolSpec,
  ToolUseBlock,
} from "./types";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a self-built AI agent.",
  "You may call tools when helpful. Prefer concise, accurate responses.",
  "When a tool call fails, examine the error and decide whether to retry, switch tools, or answer with what you know.",
].join("\n");

function isToolUse(b: ContentBlock): b is ToolUseBlock {
  return b.type === "tool_use";
}

export interface RunDeps {
  dispatcher?: ToolDispatcher;
  tools?: ToolSpec[];
}

export async function runAgent(
  input: string | Message[],
  opts: RunOptions = {},
  deps: RunDeps = {}
): Promise<RunResult> {
  const sessionId = opts.sessionId ?? `sess-${Date.now().toString(36)}`;
  const log = logger.child({ sessionId });

  const messages: Message[] =
    typeof input === "string"
      ? [{ role: "user", content: [{ type: "text", text: input }] }]
      : [...input];

  const dispatcher = deps.dispatcher ?? defaultDispatcher;
  const tools: ToolSpec[] = deps.tools ?? opts.tools ?? dispatcher.specs();

  const maxTurns = opts.maxTurns ?? config.loop.maxTurns;
  const systemBase = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) throw new AgentError("Aborted");

    const res = await complete({
      model: opts.model ?? config.model.primary,
      system: systemBase,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      maxTokens: opts.maxTokens ?? config.loop.maxTokens,
      signal: opts.signal,
    });

    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content });

    if (res.stopReason === "end_turn" || res.stopReason === "stop_sequence") {
      const text = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      log.info({ turns: turn + 1, usage }, "agent.end_turn");
      return {
        sessionId,
        text,
        messages,
        turns: turn + 1,
        usage,
        stopReason: res.stopReason,
      };
    }

    if (res.stopReason === "tool_use") {
      const toolUses = res.content.filter(isToolUse);
      if (toolUses.length === 0) {
        throw new AgentError("LlmError", "tool_use stop_reason with no tool_use blocks");
      }
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      opts.signal?.addEventListener("abort", onAbort);
      try {
        const results = await Promise.all(
          toolUses.map(async (tu) => {
            const r = await dispatcher.invoke(tu.name, tu.input, {
              sessionId,
              signal: ac.signal,
              logger: log,
            });
            const block: ToolResultBlock = {
              type: "tool_result",
              tool_use_id: tu.id,
              content: r.content,
              is_error: !r.ok,
            };
            return block;
          })
        );
        messages.push({ role: "user", content: results });
      } finally {
        opts.signal?.removeEventListener("abort", onAbort);
      }
      continue;
    }

    if (res.stopReason === "max_tokens") {
      throw new AgentError("LlmError", "max_tokens reached");
    }

    throw new AgentError("UnsupportedStopReason", res.stopReason);
  }

  throw new AgentError("MaxTurnsExceeded");
}
