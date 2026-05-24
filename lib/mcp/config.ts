import { promises as fs } from "node:fs";
import { AgentError } from "@/lib/agent/errors";
import config from "@/agent.config";
import { McpConfigSchema, type McpConfig } from "./types";

export async function loadMcpConfig(path?: string): Promise<McpConfig> {
  const target = path ?? config.mcp.configPath;
  try {
    const raw = await fs.readFile(target, "utf-8");
    const parsed = McpConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new AgentError("ConfigError", `mcp config invalid: ${parsed.error.message}`);
    }
    return parsed.data;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: {} };
    }
    if (e instanceof AgentError) throw e;
    throw new AgentError(
      "ConfigError",
      `failed to read mcp config: ${e instanceof Error ? e.message : String(e)}`,
      e
    );
  }
}
