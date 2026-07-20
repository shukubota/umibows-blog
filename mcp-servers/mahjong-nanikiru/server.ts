/**
 * mahjong-nanikiru : 何切る MCP Apps サーバー（公式 ext-apps 準拠 / stdio 版）
 *
 * show_mahjong_hand ツールに手牌(牌コード配列)を渡すと、
 *   - シャンテン数・受け入れ・推奨打牌を計算し
 *   - ui://mahjong-nanikiru/hand.html（牌SVGを描画するView）で表示する
 *
 * シャンテン/受け入れの計算ロジックは ./nanikiru-core.ts に単一ソース化してあり、
 * Vercel の remote MCP ルートと共有する。ここは stdio トランスポート＋
 * dist/hand.html を fs で読むリソース提供に責務を絞る。
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  analyzeHand,
  TILES_DESCRIPTION,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_TITLE,
} from "./nanikiru-core.js";

const ROOT = import.meta.filename.endsWith(".ts")
  ? import.meta.dirname
  : path.join(import.meta.dirname, "..");

export function createServer(): McpServer {
  const server = new McpServer({ name: "mahjong-nanikiru", version: "0.4.0" });
  const resourceUri = "ui://mahjong-nanikiru/hand.html";

  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: TOOL_TITLE,
      description: TOOL_DESCRIPTION,
      inputSchema: {
        tiles: z.array(z.string()).describe(TILES_DESCRIPTION),
      },
      _meta: { ui: { resourceUri } },
    },
    async ({ tiles }): Promise<CallToolResult> => {
      const { structuredContent, text, isError } = analyzeHand(tiles);
      return {
        content: [{ type: "text", text }],
        structuredContent,
        ...(isError ? { isError: true } : {}),
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(ROOT, "dist", "hand.html"), "utf-8");
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );

  return server;
}
