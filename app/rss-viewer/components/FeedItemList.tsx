import type { FeedItem } from "@/lib/rss/types";
import FeedItemCard from "./FeedItemCard";

export default function FeedItemList({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">
        このフィードには記事がありません。
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <FeedItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
