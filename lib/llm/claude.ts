import Anthropic from "@anthropic-ai/sdk";
import { AgentError } from "@/lib/agent/errors";
import type { ContentBlock, Message, StopReason, Usage } from "@/lib/agent/types";

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

export interface CompleteParams {
  model?: string;
  system?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompleteResult {
  stopReason: StopReason;
  content: ContentBlock[];
  usage: Usage;
}

export async function complete(p: CompleteParams): Promise<CompleteResult> {
  const model = p.model ?? DEFAULT_MODEL;
  try {
    const res = await client().messages.create(
      {
        model,
        system: p.system,
        max_tokens: p.maxTokens ?? 4096,
        temperature: p.temperature,
        messages: p.messages.map((m) => ({
          role: m.role,
          content: m.content as Anthropic.Messages.ContentBlockParam[],
        })),
      },
      { signal: p.signal }
    );

    return {
      stopReason: (res.stop_reason ?? "end_turn") as StopReason,
      content: res.content as ContentBlock[],
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    };
  } catch (e) {
    if (e instanceof AgentError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new AgentError("Aborted", "Request aborted", e);
    }
    throw new AgentError("LlmError", e instanceof Error ? e.message : String(e), e);
  }
}
