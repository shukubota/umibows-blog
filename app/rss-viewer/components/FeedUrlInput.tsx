"use client";

type Props = {
  url: string;
  loading: boolean;
  onChange: (url: string) => void;
  onSubmit: (url: string) => void;
};

export default function FeedUrlInput({ url, loading, onChange, onSubmit }: Props) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(url);
      }}
    >
      <label className="sr-only" htmlFor="feed-url">
        Feed URL
      </label>
      <input
        id="feed-url"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/feed.xml"
        className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
      >
        {loading ? "読込中…" : "読込"}
      </button>
    </form>
  );
}
