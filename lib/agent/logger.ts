import pino from "pino";

const REDACT_PATHS = [
  "*.apiKey",
  "*.api_key",
  "*.authorization",
  "*.Authorization",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "ANTHROPIC_API_KEY",
];

export const logger = pino({
  level: process.env.AGENT_LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  base: { app: "ai-agent" },
});

export type Logger = pino.Logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
