import type { Feed } from "@/lib/rss/types";

export default function FeedHeader({ feed }: { feed: Feed }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-white">{feed.title}</h2>
          {feed.siteUrl && (
            <a
              href={feed.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-blue-400 hover:text-blue-300"
            >
              {feed.siteUrl}
            </a>
          )}
        </div>
        <div className="whitespace-nowrap text-right text-xs text-gray-500">
          <div>{feed.items.length} 件</div>
          <div className="uppercase">{feed.format}</div>
        </div>
      </div>
      {feed.description && <p className="mt-3 text-sm text-gray-400">{feed.description}</p>}
    </div>
  );
}
