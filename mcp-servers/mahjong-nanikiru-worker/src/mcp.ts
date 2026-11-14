/**
 * 何切る MCP サーバー本体（ステートレス、Streamable HTTP）。
 *
 * OAuthProvider の apiHandler から呼ばれるので、ここに届くリクエストはトークン検証済み。
 * シャンテン/受け入れ計算は stdio 版・Vercel 版と同じ nanikiru-core.ts を使う（単一ソース）。
 * 牌UI（hand.html）も Vercel 版が追跡しているコピーをそのまま文字列として import する。
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import handHtml from "../../../app/api/mcp/mahjong-nanikiru/hand.html";
import {
  analyzeHand,
  TILES_DESCRIPTION,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_TITLE,
} from "../../mahjong-nanikiru/nanikiru-core";

const RESOURCE_URI = "ui://mahjong-nanikiru/hand.html";

function buildServer(): McpServer {
  const server = new McpServer({ name: "mahjong-nanikiru", version: "0.5.0" });

  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: TOOL_TITLE,
      description: TOOL_DESCRIPTION,
      inputSchema: z.object({
        tiles: z.array(z.string()).describe(TILES_DESCRIPTION),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ tiles }) => {
      const { structuredContent, text, isError } = analyzeHand(tiles);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
        ...(isError ? { isError: true } : {}),
      };
    }
  );

  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: handHtml }],
    })
  );

  return server;
}

export const mcpHandler = createMcpHandler(buildServer, { route: "/mcp" });
