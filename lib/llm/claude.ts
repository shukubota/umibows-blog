import Anthropic from "@anthropic-ai/sdk";
import { AgentError, LlmError } from "@/lib/agent/errors";
import type { ContentBlock, Message, StopReason, ToolSpec, Usage } from "@/lib/agent/types";
import { logger } from "@/lib/agent/logger";

export const DEFAULT_MODEL = "claude-sonnet-4-5";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AgentError("MissingApiKey", "ANTHROPIC_API_KEY is not set");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export type ToolChoice = { type: "auto" } | { type: "any" } | { type: "tool"; name: string };

export interface CompleteParams {
  model?: string;
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
  toolChoice?: ToolChoice;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompleteResult {
  stopReason: StopReason;
  content: ContentBlock[];
  usage: Usage;
}

export interface StreamCallbacks {
  onTextDelta?: (delta: string) => void;
  onToolUse?: (id: string, name: string) => void;
}

function toAnthropicTools(tools?: ToolSpec[]): Anthropic.Messages.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as unknown as Anthropic.Messages.Tool.InputSchema,
  }));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const status = (e as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt === retries - 1) break;
      const delay = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function complete(p: CompleteParams): Promise<CompleteResult> {
  const model = p.model ?? DEFAULT_MODEL;
  const started = Date.now();
  try {
    const res = await withRetry(() =>
      client().messages.create(
        {
          model,
          system: p.system,
          max_tokens: p.maxTokens ?? 4096,
          temperature: p.temperature,
          tools: toAnthropicTools(p.tools),
          tool_choice: p.toolChoice as Anthropic.Messages.MessageCreateParams["tool_choice"],
          messages: p.messages.map((m) => ({
            role: m.role,
            content: m.content as Anthropic.Messages.ContentBlockParam[],
          })),
        },
        { signal: p.signal }
      )
    );

    const usage: Usage = {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    };
    logger.info(
      { model, latencyMs: Date.now() - started, usage, stopReason: res.stop_reason },
      "llm.complete"
    );
    return {
      stopReason: (res.stop_reason ?? "end_turn") as StopReason,
      content: res.content as ContentBlock[],
      usage,
    };
  } catch (e) {
    if (e instanceof AgentError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new AgentError("Aborted", "Request aborted", e);
    }
    throw new LlmError(e instanceof Error ? e.message : String(e), e);
  }
}

export async function* stream(
  p: CompleteParams
): AsyncGenerator<
  | { type: "text_delta"; delta: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_delta"; id: string; partial_json: string }
  | { type: "stop"; stopReason: StopReason; usage: Usage; content: ContentBlock[] }
> {
  const model = p.model ?? DEFAULT_MODEL;
  const started = Date.now();

  const s = client().messages.stream(
    {
      model,
      system: p.system,
      max_tokens: p.maxTokens ?? 4096,
      temperature: p.temperature,
      tools: toAnthropicTools(p.tools),
      messages: p.messages.map((m) => ({
        role: m.role,
        content: m.content as Anthropic.Messages.ContentBlockParam[],
      })),
    },
    { signal: p.signal }
  );

  try {
    for await (const event of s) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "tool_use") {
          yield { type: "tool_use_start", id: block.id, name: block.name };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text_delta", delta: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          yield {
            type: "tool_use_delta",
            id: String(event.index),
            partial_json: event.delta.partial_json,
          };
        }
      }
    }
    const final = await s.finalMessage();
    const usage: Usage = {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
    };
    logger.info(
      { model, latencyMs: Date.now() - started, usage, stopReason: final.stop_reason },
      "llm.stream"
    );
    yield {
      type: "stop",
      stopReason: (final.stop_reason ?? "end_turn") as StopReason,
      usage,
      content: final.content as ContentBlock[],
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AgentError("Aborted", "Stream aborted", e);
    }
    throw new LlmError(e instanceof Error ? e.message : String(e), e);
  }
}
