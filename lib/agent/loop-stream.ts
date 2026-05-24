import { stream as llmStream } from "@/lib/llm/claude";
import { AgentError } from "./errors";
import { ToolDispatcher, defaultDispatcher } from "./dispatcher";
import { logger } from "./logger";
import config from "@/agent.config";
import { memory } from "./memory";
import type {
  ContentBlock,
  Message,
  RunOptions,
  RunResult,
  StreamEvent,
  ToolResultBlock,
  ToolSpec,
  ToolUseBlock,
  SessionState,
} from "./types";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a self-built AI agent.",
  "You may call tools when helpful. Prefer concise, accurate responses.",
].join("\n");

function isToolUse(b: ContentBlock): b is ToolUseBlock {
  return b.type === "tool_use";
}

export interface RunDeps {
  dispatcher?: ToolDispatcher;
  tools?: ToolSpec[];
}

export async function* runAgentStream(
  input: string | Message[],
  opts: RunOptions = {},
  deps: RunDeps = {}
): AsyncGenerator<StreamEvent> {
  const dispatcher = deps.dispatcher ?? defaultDispatcher;
  const tools = deps.tools ?? opts.tools ?? dispatcher.specs();
  const maxTurns = opts.maxTurns ?? config.loop.maxTurns;
  const systemBase = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  let state: SessionState | null = opts.sessionId ? await memory.load(opts.sessionId) : null;
  if (!state) {
    state = memory.newSession();
    if (opts.sessionId) state.sessionId = opts.sessionId;
  }
  const log = logger.child({ sessionId: state.sessionId });

  const incoming: Message[] =
    typeof input === "string"
      ? [{ role: "user", content: [{ type: "text", text: input }] }]
      : [...input];

  state.messages.push(...incoming);
  state = await memory.summarizeIfNeeded(state);

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) {
      yield { type: "error", message: "Aborted", code: "Aborted" };
      throw new AgentError("Aborted");
    }
    state.turnCount = turn + 1;

    const turnContent: ContentBlock[] = [];
    let stopReason: import("./types").StopReason = "end_turn";
    let usage = { input_tokens: 0, output_tokens: 0 };

    try {
      for await (const ev of llmStream({
        model: opts.model ?? config.model.primary,
        system: systemBase,
        messages: state.messages,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: opts.maxTokens ?? config.loop.maxTokens,
        signal: opts.signal,
      })) {
        if (ev.type === "text_delta") {
          yield { type: "text", delta: ev.delta };
        } else if (ev.type === "tool_use_start") {
          yield { type: "tool_use_start", id: ev.id, name: ev.name };
        } else if (ev.type === "stop") {
          stopReason = ev.stopReason;
          usage = ev.usage;
          turnContent.push(...ev.content);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "error", message: msg };
      throw e;
    }

    state.tokensUsed.input_tokens += usage.input_tokens;
    state.tokensUsed.output_tokens += usage.output_tokens;
    state.messages.push({ role: "assistant", content: turnContent });
    yield { type: "turn_end", turn: turn + 1, stopReason };

    if (stopReason === "end_turn" || stopReason === "stop_sequence") {
      const text = turnContent
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      const result: RunResult = {
        sessionId: state.sessionId,
        text,
        messages: state.messages,
        turns: turn + 1,
        usage: state.tokensUsed,
        stopReason,
      };
      await memory.save(state);
      log.info({ turns: turn + 1, usage: state.tokensUsed }, "agent.stream.done");
      yield { type: "done", result };
      return;
    }

    if (stopReason === "tool_use") {
      const toolUses = turnContent.filter(isToolUse);
      const results: ToolResultBlock[] = [];
      for (const tu of toolUses) {
        const r = await dispatcher.invoke(tu.name, tu.input, {
          sessionId: state.sessionId,
          signal: opts.signal ?? new AbortController().signal,
          logger: log,
        });
        const preview = r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content;
        yield { type: "tool_result", id: tu.id, ok: r.ok, preview };
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.content,
          is_error: !r.ok,
        });
      }
      state.messages.push({ role: "user", content: results });
      continue;
    }

    if (stopReason === "max_tokens") {
      yield { type: "error", message: "max_tokens reached", code: "LlmError" };
      throw new AgentError("LlmError", "max_tokens reached");
    }
  }

  yield { type: "error", message: "MaxTurnsExceeded", code: "MaxTurnsExceeded" };
  throw new AgentError("MaxTurnsExceeded");
}
