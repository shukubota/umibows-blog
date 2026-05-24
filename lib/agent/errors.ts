export type AgentErrorCode =
  | "Aborted"
  | "MaxTurnsExceeded"
  | "UnsupportedStopReason"
  | "MissingApiKey"
  | "LlmError"
  | "ToolNotFound"
  | "ToolError"
  | "ToolTimeout"
  | "ToolValidation"
  | "McpError"
  | "SkillError"
  | "ConfigError";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly cause?: unknown;
  readonly retryable?: boolean;

  constructor(
    code: AgentErrorCode,
    message?: string,
    cause?: unknown,
    opts: { retryable?: boolean } = {}
  ) {
    super(message ?? code);
    this.name = "AgentError";
    this.code = code;
    this.cause = cause;
    this.retryable = opts.retryable;
  }
}

export class ToolError extends AgentError {
  constructor(
    code: "ToolNotFound" | "ToolError" | "ToolTimeout" | "ToolValidation",
    message: string,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "ToolError";
  }
}

export class LlmError extends AgentError {
  constructor(message: string, cause?: unknown, retryable = false) {
    super("LlmError", message, cause, { retryable });
    this.name = "LlmError";
  }
}
