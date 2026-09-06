"use client";

import type { FeedItem } from "@/lib/rss/types";

/** サーバから ISO 8601 で受け取っているので、表示だけ JST に寄せる */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedItemCard({ item }: { item: FeedItem }) {
  const meta = [item.publishedAt ? formatDate(item.publishedAt) : "", item.author]
    .filter(Boolean)
    .join(" · ");

  // フィード提供元のホストから直接読む。任意ドメインが相手なので next/image は使えず
  // （ドメイン登録が必要）、参照元は referrerPolicy で送らない
  const thumbnail = item.imageUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      // 画像が消えている / 取得できないフィードは珍しくないので、壊れたアイコンは出さない
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
      className="h-24 w-24 flex-shrink-0 rounded border border-gray-800 bg-gray-950 object-contain"
    />
  );

  return (
    <article className="flex gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700">
      {thumbnail &&
        (item.link ? (
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            {thumbnail}
          </a>
        ) : (
          thumbnail
        ))}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-white">
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-300"
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h3>
        {meta && <p className="mt-1 text-xs text-gray-500">{meta}</p>}
        {item.summary && <p className="mt-2 line-clamp-3 text-sm text-gray-400">{item.summary}</p>}
      </div>
    </article>
  );
}
