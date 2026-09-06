import type { Metadata } from "next";
import Link from "next/link";
import RssViewer from "./components/RssViewer";

export const metadata: Metadata = {
  title: "RSS Viewer | Umibows Blog",
  description: "RSS / Atom フィードの XML URL を入力して記事一覧を表示するビューア",
};

export default function RssViewerPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">RSS Viewer</h1>
            <p className="text-sm text-gray-400 mt-1">
              RSS / Atom の XML URL を貼ると記事一覧を表示します
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 whitespace-nowrap">
            ← Blog List
          </Link>
        </div>
        <RssViewer />
      </div>
    </main>
  );
}
