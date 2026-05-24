import { defaultDispatcher } from "./dispatcher";
import { registerBuiltins } from "@/lib/tools/registry";
import { ensureMcpRegistered } from "@/lib/mcp/registry";
import { logger } from "./logger";

let builtinReady = false;
let mcpPromise: Promise<void> | null = null;

/** Idempotent: register builtins. */
export function bootstrapBuiltins(): void {
  if (builtinReady) return;
  registerBuiltins(defaultDispatcher);
  builtinReady = true;
  logger.info({ tools: defaultDispatcher.specs().map((s) => s.name) }, "agent.bootstrap.builtins");
}

/** Idempotent: register builtins + connect MCP servers. */
export async function bootstrapAll(): Promise<void> {
  bootstrapBuiltins();
  if (!mcpPromise) {
    mcpPromise = ensureMcpRegistered(defaultDispatcher).catch((e) => {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e) },
        "agent.bootstrap.mcp_failed"
      );
    });
  }
  await mcpPromise;
}

/** Backward-compat alias used by Phase 0 callers. */
export function bootstrap(): void {
  bootstrapBuiltins();
}
