import { complete } from "@/lib/llm/claude";
import { AgentError } from "./errors";
import type { Message, RunOptions, RunResult } from "./types";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a self-built AI agent (Phase 0).",
  "Respond concisely and helpfully in the user's language.",
].join("\n");

export async function runAgent(
  input: string | Message[],
  opts: RunOptions = {}
): Promise<RunResult> {
  const messages: Message[] =
    typeof input === "string"
      ? [{ role: "user", content: [{ type: "text", text: input }] }]
      : [...input];

  const maxTurns = opts.maxTurns ?? 20;
  const system = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) {
      throw new AgentError("Aborted");
    }

    const res = await complete({
      model: opts.model,
      system,
      messages,
      maxTokens: opts.maxTokens,
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
      return {
        text,
        messages,
        turns: turn + 1,
        usage,
        stopReason: res.stopReason,
      };
    }

    if (res.stopReason === "max_tokens") {
      throw new AgentError("LlmError", "max_tokens hit before tool use was added (Phase 0)");
    }

    if (res.stopReason === "tool_use") {
      throw new AgentError(
        "UnsupportedStopReason",
        "tool_use not implemented in Phase 0"
      );
    }

    throw new AgentError("UnsupportedStopReason", res.stopReason);
  }

  throw new AgentError("MaxTurnsExceeded");
}
