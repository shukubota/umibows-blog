"use client";

type Props = {
  urls: string[];
  onSelect: (url: string) => void;
};

/** 表示は冗長になりすぎないようホスト名 + パス末尾に短縮する */
function shorten(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return pathname === "/" ? hostname : `${hostname}${pathname}`;
  } catch {
    return url;
  }
}

export default function RecentFeeds({ urls, onSelect }: Props) {
  if (urls.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500">最近:</span>
      {urls.map((url) => (
        <button
          key={url}
          type="button"
          title={url}
          onClick={() => onSelect(url)}
          className="max-w-full truncate rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-blue-500 hover:text-blue-300"
        >
          {shorten(url)}
        </button>
      ))}
    </div>
  );
}
