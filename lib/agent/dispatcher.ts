import { ToolError, AgentError } from "./errors";
import { logger } from "./logger";
import type { RegisteredTool, ToolContext, ToolHandler, ToolResult, ToolSpec } from "./types";
import config from "@/agent.config";

export class ToolDispatcher {
  private tools = new Map<string, RegisteredTool>();

  register(spec: ToolSpec, handler: ToolHandler): void {
    if (this.tools.has(spec.name)) {
      logger.warn({ name: spec.name }, "tool.overwrite");
    }
    this.tools.set(spec.name, { spec, handler });
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  specs(): ToolSpec[] {
    return Array.from(this.tools.values()).map((t) => t.spec);
  }

  async invoke(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new ToolError("ToolNotFound", `tool not registered: ${name}`);
    }
    const start = Date.now();
    const timeoutMs = config.loop.toolTimeoutMs;
    const log = ctx.logger.child({ tool: name });

    try {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      ctx.signal.addEventListener("abort", onAbort);
      const timer = setTimeout(() => ac.abort(), timeoutMs);

      try {
        const childCtx: ToolContext = { ...ctx, signal: ac.signal, logger: log };
        const result = await entry.handler.invoke(input, childCtx);
        log.info(
          { latencyMs: Date.now() - start, ok: result.ok, bytes: result.content.length },
          "tool.invoke"
        );
        return result;
      } finally {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", onAbort);
      }
    } catch (e) {
      log.warn({ err: e instanceof Error ? e.message : String(e) }, "tool.error");
      if (e instanceof AgentError) {
        return {
          ok: false,
          content: `${e.code}: ${e.message}`,
          error: { code: e.code, message: e.message },
        };
      }
      if (e instanceof Error && e.name === "AbortError") {
        return {
          ok: false,
          content: `ToolTimeout: ${name} exceeded ${timeoutMs}ms`,
          error: { code: "ToolTimeout", message: `exceeded ${timeoutMs}ms` },
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        content: `ToolError: ${msg}`,
        error: { code: "ToolError", message: msg },
      };
    }
  }
}

export const defaultDispatcher = new ToolDispatcher();
