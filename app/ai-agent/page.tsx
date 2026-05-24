"use client";

import { useRef, useState } from "react";

type ChatTurn = { role: "user" | "assistant"; text: string };

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "turn_end"; turn: number; stopReason: string }
  | {
      type: "done";
      result: {
        text: string;
        turns: number;
        usage: { input_tokens: number; output_tokens: number };
        sessionId: string;
      };
    }
  | { type: "error"; message: string; code?: string };

export default function AiAgentPage() {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ turns: number; tokens: number; sessionId?: string } | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState("");
  const [toolEvents, setToolEvents] = useState<string[]>([]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    setPartial("");
    setToolEvents([]);
    setInput("");
    const nextHistory: ChatTurn[] = [...history, { role: "user", text }];
    setHistory(nextHistory);
    setPending(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/ai-agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history,
          input: text,
          sessionId: sessionIdRef.current,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
          if (!line.trim()) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "text") {
            acc += ev.delta;
            setPartial(acc);
          } else if (ev.type === "tool_use_start") {
            setToolEvents((prev) => [...prev, `→ ${ev.name}`]);
          } else if (ev.type === "tool_result") {
            setToolEvents((prev) => [...prev, `${ev.ok ? "✓" : "✗"} ${ev.preview.slice(0, 60)}`]);
          } else if (ev.type === "done") {
            sessionIdRef.current = ev.result.sessionId;
            setHistory([...nextHistory, { role: "assistant", text: ev.result.text || acc }]);
            setMeta({
              turns: ev.result.turns,
              tokens: ev.result.usage.input_tokens + ev.result.usage.output_tokens,
              sessionId: ev.result.sessionId,
            });
            setPartial("");
          } else if (ev.type === "error") {
            setError(`${ev.code ?? "error"}: ${ev.message}`);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setPending(false);
  }

  function reset() {
    setHistory([]);
    setError(null);
    setMeta(null);
    setPartial("");
    setToolEvents([]);
    sessionIdRef.current = undefined;
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">
            AI Agent <span className="text-neutral-500 text-sm ml-2">self-built · MCP · Skill</span>
          </h1>
          <button
            onClick={reset}
            className="text-sm text-neutral-400 hover:text-neutral-200"
            type="button"
          >
            Reset
          </button>
        </header>

        <p className="mb-6 text-sm text-neutral-400">
          Claude
          APIをSDK経由でだけ使い、思考ループ・ツール・MCP・Skillをすべて自前実装した最小エージェント。
        </p>

        <div className="mb-4 space-y-3">
          {history.length === 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
              メッセージを入力してください（例: 「こんにちは」「7203の株価を教えて」）。
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
          {pending && (
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
              <div className="text-xs text-neutral-500 mb-1">Agent</div>
              <div className="whitespace-pre-wrap text-sm">{partial || "..."}</div>
              {toolEvents.length > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
                  {toolEvents.map((t, i) => (
                    <div key={i}>{t}</div>
                  ))}
                </div>
              )}
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
            disabled={pending}
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600 disabled:opacity-50"
          />
          {pending ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-600"
            >
              中断
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              送信
            </button>
          )}
        </form>

        {meta && (
          <div className="mt-4 text-xs text-neutral-500">
            turns: {meta.turns} / tokens: {meta.tokens}
            {meta.sessionId && <> / session: {meta.sessionId}</>}
          </div>
        )}
      </div>
    </main>
  );
}
