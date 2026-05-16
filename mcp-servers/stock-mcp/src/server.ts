import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolDefs } from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "stock-mcp",
    version: "0.1.0",
  });

  for (const def of toolDefs) {
    server.tool(
      def.name,
      def.description,
      def.inputSchema.shape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      def.handler as any,
    );
  }

  return server;
}
