"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed, FeedErrorCode } from "@/lib/rss/types";
import FeedUrlInput from "./FeedUrlInput";
import RecentFeeds from "./RecentFeeds";
import FeedHeader from "./FeedHeader";
import FeedItemList from "./FeedItemList";

const RECENT_KEY = "rss-viewer:recent";
const RECENT_MAX = 5;

const SAMPLE_FEEDS = ["https://zenn.dev/feed", "https://news.ycombinator.com/rss"];

/** エラーコードごとに「次に何をすればよいか」を添える */
const ERROR_HINTS: Partial<Record<FeedErrorCode, string>> = {
  blocked_host: "外部に公開されたフィード URL を指定してください。",
  invalid_url: "http:// または https:// で始まる XML の URL を指定してください。",
  not_feed: "RSS / Atom フィードの XML URL かどうか確認してください。",
  timeout: "時間をおいて再試行してください。",
  upstream_error: "時間をおいて再試行してください。",
  fetch_failed: "URL のホスト名が正しいか確認してください。",
};

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; feed: Feed }
  | { status: "error"; error: FeedErrorCode; message: string };

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export default function RssViewer() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ViewState>({ status: "idle" });
  const [recent, setRecent] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const rememberUrl = useCallback((feedUrl: string) => {
    setRecent((prev) => {
      const next = [feedUrl, ...prev.filter((u) => u !== feedUrl)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // プライベートモード等で書けないケースは黙って諦める（表示は続行できる）
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (rawUrl: string) => {
      const target = rawUrl.trim();
      if (!target) return;

      // 連打時は最後の入力を勝たせる
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setUrl(target);
      setState({ status: "loading" });

      try {
        const res = await fetch("/api/rss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: target }),
          signal: controller.signal,
        });
        const json = await res.json();

        if (controller.signal.aborted) return;

        if (!json?.ok) {
          setState({
            status: "error",
            error: (json?.error ?? "fetch_failed") as FeedErrorCode,
            message: json?.message ?? "フィードを取得できませんでした",
          });
          return;
        }

        setState({ status: "success", feed: json.feed as Feed });
        rememberUrl(target);
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          error: "fetch_failed",
          message: err instanceof Error ? err.message : "フィードを取得できませんでした",
        });
      }
    },
    [rememberUrl]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <FeedUrlInput
          url={url}
          loading={state.status === "loading"}
          onChange={setUrl}
          onSubmit={load}
        />
        <RecentFeeds urls={recent} onSelect={load} />
      </div>

      {state.status === "idle" && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-3">
          <p className="text-sm text-gray-300">
            購読管理はしません。URL を入れたぶんだけ、その場で読み込みます。
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_FEEDS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => load(sample)}
                className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:border-blue-500 hover:text-blue-300 transition-colors"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.status === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3"
            >
              <div className="h-4 w-2/3 rounded bg-gray-800" />
              <div className="h-3 w-1/4 rounded bg-gray-800" />
              <div className="h-3 w-full rounded bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/60 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">{state.message}</p>
          {ERROR_HINTS[state.error] && (
            <p className="mt-1 text-red-300/80">{ERROR_HINTS[state.error]}</p>
          )}
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <FeedHeader feed={state.feed} />
          <FeedItemList items={state.feed.items} />
        </div>
      )}
    </div>
  );
}
