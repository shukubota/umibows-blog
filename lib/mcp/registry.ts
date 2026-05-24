import { ToolDispatcher } from "@/lib/agent/dispatcher";
import { logger } from "@/lib/agent/logger";
import { loadMcpConfig } from "./config";
import { connectServer, toRegisteredTools } from "./client";

let mcpInitialized = false;

export async function ensureMcpRegistered(dispatcher: ToolDispatcher): Promise<void> {
  if (mcpInitialized) return;
  mcpInitialized = true;

  const cfg = await loadMcpConfig();
  const entries = Object.entries(cfg.servers);
  if (entries.length === 0) {
    logger.info("mcp.no_servers");
    return;
  }
  for (const [name, sc] of entries) {
    try {
      const handle = await connectServer(name, sc);
      for (const t of toRegisteredTools(handle)) {
        dispatcher.register(t.spec, t.handler);
      }
    } catch (e) {
      logger.warn(
        { server: name, err: e instanceof Error ? e.message : String(e) },
        "mcp.register_failed"
      );
    }
  }
}
