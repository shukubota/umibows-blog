export type AgentErrorCode =
  | "Aborted"
  | "MaxTurnsExceeded"
  | "UnsupportedStopReason"
  | "MissingApiKey"
  | "LlmError";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly cause?: unknown;

  constructor(code: AgentErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.name = "AgentError";
    this.code = code;
    this.cause = cause;
  }
}
