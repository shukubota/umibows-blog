#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio MCP servers must keep stderr for logs; stdout is the protocol channel.
  console.error("[stock-mcp] ready");
}

main().catch((err) => {
  console.error("[stock-mcp] fatal:", err);
  process.exit(1);
});
