/**
 * View（iframe）エントリ。React を #app にマウントし、Suspense で
 * ツール結果待ちのローディングを表示する。ホスト接続は ./mcp の副作用で走る。
 */
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

function Loading() {
  return (
    <div className="loading">
      <span className="spin" />
      読み込み中…
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  </StrictMode>,
);
