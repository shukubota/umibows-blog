/**
 * umibows-blog 用 MCP Apps サーバー（最小例）
 *
 * やっていること:
 *   1. 地図UIのHTMLを ui://umibows/spot-map というリソースとして登録
 *   2. show_spot ツールを登録。呼ばれたらスポット座標を返し、
 *      "このツールの出力は ui://umibows/spot-map で描画して" とクライアントに伝える
 *
 * クライアント(Claude Desktop 等)は、ツールが返した structuredContent を
 * sandbox 化した iframe(=登録したHTML) に渡してチャット内に地図を描画する。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ブログのスポットデータ（実際は記事DBやRSSから引く想定）
const spots: Record<
  string,
  { name: string; lat: number; lng: number; note: string }
> = JSON.parse(readFileSync(join(__dirname, "data", "spots.json"), "utf-8"));

// 地図UIの本体(HTML)
const SPOT_MAP_HTML = readFileSync(
  join(__dirname, "ui", "spot-map.html"),
  "utf-8"
);
const UI_URI = "ui://umibows/spot-map";

const server = new McpServer({ name: "umibows-blog-mcp", version: "0.1.0" });

// ── ① UIリソースを ui:// で登録 ──────────────────────────────
server.registerResource(
  "spot-map",
  UI_URI,
  {
    title: "海スポット地図",
    description: "スポットの位置を地図で表示するUI",
    // MCP Apps では UI は HTML。iframe で安全に描画される
    mimeType: "text/html+skybridge",
  },
  async () => ({
    contents: [
      { uri: UI_URI, mimeType: "text/html+skybridge", text: SPOT_MAP_HTML },
    ],
  })
);

// ── ② ツールを登録。出力テンプレートに ①のUIを紐づける ──────────
server.registerTool(
  "show_spot",
  {
    title: "海スポットを地図で表示",
    description:
      "エリア名(例: 鎌倉/湘南/千葉)を受け取り、その海スポットを地図UIで返す",
    inputSchema: { area: z.string().describe("エリア名。例: 鎌倉, 湘南, 千葉") },
    // ↓ MCP Apps の肝：このツールの結果は UI_URI で描画してね、という宣言
    _meta: { "openai/outputTemplate": UI_URI },
  },
  async ({ area }) => {
    const spot = spots[area];
    if (!spot) {
      const list = Object.keys(spots).join(", ");
      return {
        content: [
          { type: "text", text: `「${area}」は未登録です。対応エリア: ${list}` },
        ],
        isError: true,
      };
    }
    return {
      // テキスト回答（UI非対応クライアントへのフォールバックにもなる）
      content: [
        {
          type: "text",
          text: `${spot.name}（${area}）の地図です。${spot.note}`,
        },
      ],
      // iframe(UI)に渡されるデータ本体
      structuredContent: spot,
      // このツール出力はこのUIで描画して、と再度紐づけ
      _meta: { "openai/outputTemplate": UI_URI },
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("umibows-blog-mcp running on stdio");
