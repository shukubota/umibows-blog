"use client";

import { useState, useTransition } from "react";
import { sendMessage, type ChatTurn } from "./actions";

export default function AiAgentPage() {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ turns: number; tokens: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isPending) return;
    setError(null);
    setInput("");
    const nextHistory: ChatTurn[] = [...history, { role: "user", text }];
    setHistory(nextHistory);

    startTransition(async () => {
      const res = await sendMessage(history, text);
      if (!res.ok) {
        setError(res.error ?? "unknown error");
        return;
      }
      setHistory([...nextHistory, { role: "assistant", text: res.reply ?? "" }]);
      if (res.usage && res.turns != null) {
        setMeta({
          turns: res.turns,
          tokens: res.usage.input_tokens + res.usage.output_tokens,
        });
      }
    });
  }

  function reset() {
    setHistory([]);
    setError(null);
    setMeta(null);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">AI Agent <span className="text-neutral-500 text-sm ml-2">Phase 0</span></h1>
          <button
            onClick={reset}
            className="text-sm text-neutral-400 hover:text-neutral-200"
            type="button"
          >
            Reset
          </button>
        </header>

        <p className="mb-6 text-sm text-neutral-400">
          自作AIエージェントの最小実装。Claude APIをSDK経由で呼ぶだけのシングルターン応答。
        </p>

        <div className="mb-4 space-y-3">
          {history.length === 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
              メッセージを入力してください（例: 「こんにちは」）。
            </div>
          )}
          {history.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "user"
                  ? "rounded-lg bg-blue-950/40 border border-blue-900 p-3"
                  : "rounded-lg bg-neutral-900 border border-neutral-800 p-3"
              }
            >
              <div className="text-xs text-neutral-500 mb-1">
                {turn.role === "user" ? "You" : "Agent"}
              </div>
              <div className="whitespace-pre-wrap text-sm">{turn.text}</div>
            </div>
          ))}
          {isPending && (
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-sm text-neutral-500">
              ...
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="メッセージ..."
            disabled={isPending}
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            送信
          </button>
        </form>

        {meta && (
          <div className="mt-4 text-xs text-neutral-500">
            turns: {meta.turns} / tokens: {meta.tokens}
          </div>
        )}
      </div>
    </main>
  );
}
