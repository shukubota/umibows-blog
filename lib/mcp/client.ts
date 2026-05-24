import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AgentError } from "@/lib/agent/errors";
import { logger } from "@/lib/agent/logger";
import type {
  RegisteredTool,
  ToolHandler,
  ToolResult,
  ToolSpec,
  JsonSchema,
} from "@/lib/agent/types";
import type { McpServerConfig } from "./types";

export interface McpServerHandle {
  name: string;
  client: Client;
  tools: ToolSpec[];
  close(): Promise<void>;
}

const handles = new Map<string, McpServerHandle>();

export async function connectServer(name: string, cfg: McpServerConfig): Promise<McpServerHandle> {
  const existing = handles.get(name);
  if (existing) return existing;

  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    cwd: cfg.cwd,
  });

  const client = new Client({ name: "umibows-ai-agent", version: "0.1.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
  } catch (e) {
    throw new AgentError(
      "McpError",
      `failed to connect to MCP server "${name}": ${e instanceof Error ? e.message : String(e)}`,
      e
    );
  }

  const listed = await client.listTools();
  const tools: ToolSpec[] = listed.tools.map((t) => ({
    name: `mcp__${name}__${t.name}`,
    description: t.description ?? `(${name}) ${t.name}`,
    input_schema: normalizeSchema(t.inputSchema),
    source: "mcp",
    origin: { server: name },
  }));

  const handle: McpServerHandle = {
    name,
    client,
    tools,
    async close() {
      try {
        await client.close();
      } catch {
        // ignore
      }
      handles.delete(name);
    },
  };
  handles.set(name, handle);
  logger.info({ server: name, tools: tools.map((t) => t.name) }, "mcp.connected");
  return handle;
}

export async function disconnectAll(): Promise<void> {
  await Promise.all(Array.from(handles.values()).map((h) => h.close()));
}

export function getServerHandle(name: string): McpServerHandle | undefined {
  return handles.get(name);
}

function normalizeSchema(input: unknown): JsonSchema {
  if (input && typeof input === "object" && (input as { type?: string }).type === "object") {
    return input as JsonSchema;
  }
  return { type: "object", properties: {}, additionalProperties: true };
}

export function makeMcpHandler(serverName: string, originalToolName: string): ToolHandler {
  return {
    async invoke(input, ctx): Promise<ToolResult> {
      const handle = handles.get(serverName);
      if (!handle) {
        return {
          ok: false,
          content: `McpError: server "${serverName}" not connected`,
          error: { code: "McpError", message: `not connected: ${serverName}` },
        };
      }
      try {
        const res = await handle.client.callTool({
          name: originalToolName,
          arguments: (input ?? {}) as Record<string, unknown>,
        });
        const text = Array.isArray(res.content)
          ? res.content
              .map((c: { type?: string; text?: string }) =>
                c.type === "text" ? (c.text ?? "") : JSON.stringify(c)
              )
              .join("\n")
          : JSON.stringify(res);
        return {
          ok: !res.isError,
          content: text || "(empty)",
          raw: res,
        };
      } catch (e) {
        ctx.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "mcp.callTool");
        const msg = e instanceof Error ? e.message : String(e);
        return {
          ok: false,
          content: `McpError: ${msg}`,
          error: { code: "McpError", message: msg },
        };
      }
    },
  };
}

export function toRegisteredTools(handle: McpServerHandle): RegisteredTool[] {
  return handle.tools.map((spec) => {
    const original = spec.name.replace(`mcp__${handle.name}__`, "");
    return { spec, handler: makeMcpHandler(handle.name, original) };
  });
}
