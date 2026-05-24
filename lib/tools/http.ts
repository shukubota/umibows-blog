import { z } from "zod";
import { ToolError } from "@/lib/agent/errors";
import config from "@/agent.config";
import type { RegisteredTool, ToolHandler, ToolResult, ToolSpec } from "@/lib/agent/types";

const FetchInput = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});

function assertHostAllowed(urlStr: string): URL {
  const url = new URL(urlStr);
  const allow = config.tools.http.allowHosts;
  const ok = allow.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
  if (!ok) {
    throw new ToolError("ToolError", `host not allowed: ${url.hostname}`);
  }
  return url;
}

const spec: ToolSpec = {
  name: "http_fetch",
  description:
    "Send an HTTPS request to an allow-listed host and return status + body. Body is truncated to 200KB.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string" },
      headers: { type: "object" },
      body: { type: "string" },
      timeoutMs: { type: "number" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  source: "builtin",
};

const handler: ToolHandler = {
  async invoke(input, ctx): Promise<ToolResult> {
    const parsed = FetchInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolError("ToolValidation", parsed.error.message);
    }
    const url = assertHostAllowed(parsed.data.url);
    const timeout = parsed.data.timeoutMs ?? config.tools.http.defaultTimeoutMs;

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    ctx.signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), timeout);

    try {
      const res = await fetch(url.toString(), {
        method: parsed.data.method ?? "GET",
        headers: parsed.data.headers,
        body: parsed.data.body,
        signal: ac.signal,
      });
      const text = await res.text();
      const cap = 200 * 1024;
      const truncated = text.length > cap;
      return {
        ok: res.ok,
        content: JSON.stringify({
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: truncated ? text.slice(0, cap) : text,
          truncated,
        }),
      };
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
    }
  },
};

export const httpTools: RegisteredTool[] = [{ spec, handler }];
