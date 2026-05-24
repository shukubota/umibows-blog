import type { Logger } from "./logger";

export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: ContentBlock[];
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/** Anthropic Tool Use 互換 JSON Schema (簡易) */
export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: JsonSchema;
  source: "builtin" | "mcp" | "skill";
  origin?: { server?: string; skill?: string };
}

export interface ToolContext {
  sessionId: string;
  signal: AbortSignal;
  logger: Logger;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  raw?: unknown;
  error?: { code: string; message: string };
}

export interface ToolHandler {
  invoke(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface RegisteredTool {
  spec: ToolSpec;
  handler: ToolHandler;
}

export interface SessionState {
  sessionId: string;
  messages: Message[];
  tokensUsed: Usage;
  turnCount: number;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export interface RunOptions {
  sessionId?: string;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  tools?: ToolSpec[];
  skillHints?: string[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface RunResult {
  sessionId: string;
  text: string;
  messages: Message[];
  turns: number;
  usage: Usage;
  stopReason: StopReason;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "turn_end"; turn: number; stopReason: StopReason }
  | { type: "done"; result: RunResult }
  | { type: "error"; message: string; code?: string };
