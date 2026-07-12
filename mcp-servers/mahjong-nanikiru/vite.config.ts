import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// View(view/hand.html)をJS/CSS/牌SVG全部インラインの「1枚のHTML」にバンドルする。
// React(TSX)を含め、出力は dist/hand.html。サーバーはこれを読んで ui:// リソースとして配信する。
export default defineConfig({
  root: "view",
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "../dist",
    // false: build:view 単体でも dist/index.js・server.js を消さない（誤消去防止）
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "view/hand.html"),
    },
  },
});
