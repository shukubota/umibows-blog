import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// View(view/hand.html)をJS/CSS/牌SVG全部インラインの「1枚のHTML」にバンドルする。
// 出力は dist/hand.html。サーバーはこれを読んで ui:// リソースとして配信する。
export default defineConfig({
  root: "view",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "view/hand.html"),
    },
  },
});
