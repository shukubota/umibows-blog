/**
 * stdio で MCP サーバーを起動するエントリポイント。
 * Claude Desktop など stdio クライアントから呼ばれる。
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

await createServer().connect(new StdioServerTransport());
console.error("umibows-blog-mcp (MCP Apps) running on stdio");
