import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/rss/parse";

const BASE = "https://example.com/feed.xml";

function rss(items: string, channelExtra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Blog</title>
    <link>https://example.com</link>
    <description>サンプルの説明</description>
    ${channelExtra}
    ${items}
  </channel>
</rss>`;
}

describe("parseFeed / RSS 2.0", () => {
  it("チャンネルと記事の基本フィールドを取り出す", () => {
    const result = parseFeed(
      rss(`<item>
        <title>はじめての記事</title>
        <link>/posts/1</link>
        <guid isPermaLink="false">post-1</guid>
        <pubDate>Mon, 01 Sep 2025 00:00:00 +0900</pubDate>
        <dc:creator>umibows</dc:creator>
        <description>本文の概要</description>
      </item>`),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.format).toBe("rss");
    expect(result.feed.title).toBe("Example Blog");
    expect(result.feed.siteUrl).toBe("https://example.com/");
    expect(result.feed.description).toBe("サンプルの説明");

    const [item] = result.feed.items;
    expect(item.title).toBe("はじめての記事");
    // 相対リンクは取得元 URL を基準に絶対化する
    expect(item.link).toBe("https://example.com/posts/1");
    expect(item.id).toBe("post-1");
    expect(item.publishedAt).toBe("2025-08-31T15:00:00.000Z");
    expect(item.author).toBe("umibows");
    expect(item.summary).toBe("本文の概要");
  });

  it("CDATA を展開し、HTML タグを除去してプレーンテキストにする", () => {
    const result = parseFeed(
      rss(`<item>
        <title><![CDATA[CDATA なタイトル]]></title>
        <description><![CDATA[<p>HTML の <b>概要</b> &amp; 記号</p>]]></description>
      </item>`),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].title).toBe("CDATA なタイトル");
    expect(result.feed.items[0].summary).toBe("HTML の 概要 & 記号");
  });

  it("エスケープされた HTML もタグを除去する", () => {
    const result = parseFeed(
      rss(`<item><title>esc</title><description>&lt;p&gt;概要&lt;/p&gt;</description></item>`),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].summary).toBe("概要");
  });

  it("description が無ければ content:encoded を使う", () => {
    const result = parseFeed(
      rss(
        `<item><title>c</title><content:encoded><![CDATA[<p>本文</p>]]></content:encoded></item>`
      ),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].summary).toBe("本文");
  });

  it("パースできない日付は undefined にする", () => {
    const result = parseFeed(rss(`<item><title>d</title><pubDate>いつか</pubDate></item>`), BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].publishedAt).toBeUndefined();
  });

  it("記事が 0 件でも成功として扱う", () => {
    const result = parseFeed(rss(""), BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items).toEqual([]);
  });

  it("記事は 200 件で打ち切り、元の順序を保つ", () => {
    const items = Array.from(
      { length: 300 },
      (_, i) => `<item><title>記事 ${i}</title><link>/posts/${i}</link></item>`
    ).join("");
    const result = parseFeed(rss(items), BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items).toHaveLength(200);
    expect(result.feed.items[0].title).toBe("記事 0");
    expect(result.feed.items[199].title).toBe("記事 199");
  });

  it("概要は 400 文字で切って省略記号を付ける", () => {
    const long = "あ".repeat(500);
    const result = parseFeed(
      rss(`<item><title>l</title><description>${long}</description></item>`),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].summary).toBe(`${"あ".repeat(400)}…`);
  });

  it("http(s) 以外のリンクは破棄する", () => {
    const result = parseFeed(
      rss(`<item><title>j</title><link>javascript:alert(1)</link></item>`),
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].link).toBeUndefined();
  });
});

describe("parseFeed / RSS 1.0 (RDF)", () => {
  it("rdf:RDF 直下の item を読む", () => {
    const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>RDF Blog</title><link>https://rdf.example.com</link></channel>
  <item rdf:about="https://rdf.example.com/1">
    <title>RDF の記事</title>
    <link>https://rdf.example.com/1</link>
    <dc:date>2025-09-01T09:00:00+09:00</dc:date>
    <dc:creator>rdf-author</dc:creator>
  </item>
</rdf:RDF>`;
    const result = parseFeed(xml, BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.format).toBe("rss");
    expect(result.feed.title).toBe("RDF Blog");
    expect(result.feed.items[0].title).toBe("RDF の記事");
    expect(result.feed.items[0].publishedAt).toBe("2025-09-01T00:00:00.000Z");
    expect(result.feed.items[0].author).toBe("rdf-author");
  });
});

describe("parseFeed / Atom", () => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <subtitle>Atom の説明</subtitle>
  <link rel="self" href="https://atom.example.com/feed"/>
  <link rel="alternate" href="https://atom.example.com/"/>
  <entry>
    <title>Atom の記事</title>
    <link rel="enclosure" href="https://atom.example.com/audio.mp3"/>
    <link rel="alternate" href="https://atom.example.com/posts/1"/>
    <id>tag:atom.example.com,2025:1</id>
    <published>2025-09-01T00:00:00Z</published>
    <updated>2025-09-05T00:00:00Z</updated>
    <author><name>atom-author</name></author>
    <summary type="html">&lt;b&gt;Atom の概要&lt;/b&gt;</summary>
  </entry>
</feed>`;

  it("rel=alternate の href と published を優先する", () => {
    const result = parseFeed(atom, BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.format).toBe("atom");
    expect(result.feed.title).toBe("Atom Blog");
    expect(result.feed.siteUrl).toBe("https://atom.example.com/");
    expect(result.feed.description).toBe("Atom の説明");

    const [item] = result.feed.items;
    expect(item.link).toBe("https://atom.example.com/posts/1");
    expect(item.id).toBe("tag:atom.example.com,2025:1");
    expect(item.publishedAt).toBe("2025-09-01T00:00:00.000Z");
    expect(item.author).toBe("atom-author");
    expect(item.summary).toBe("Atom の概要");
  });

  it("published が無ければ updated を使い、summary が無ければ content を使う", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
      <entry><title>E</title><updated>2025-09-05T00:00:00Z</updated>
      <content type="html">&lt;p&gt;本文&lt;/p&gt;</content></entry></feed>`;
    const result = parseFeed(xml, BASE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].publishedAt).toBe("2025-09-05T00:00:00.000Z");
    expect(result.feed.items[0].summary).toBe("本文");
  });
});

describe("parseFeed / フィードでない入力", () => {
  it.each([
    ["空文字", ""],
    ["HTML", "<html><body><h1>hello</h1></body></html>"],
    ["JSON", '{"items":[]}'],
  ])("%s は not_feed になる", (_label, input) => {
    const result = parseFeed(input, BASE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_feed");
  });

  it("閉じタグが欠けたフィードは読める範囲で復帰する", () => {
    // 現実のフィードは細かく壊れていることがあるため、寛容にパースする方針
    const result = parseFeed(
      "<rss><channel><title>壊れかけ</title><item><title>記事</title></channel>",
      BASE
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.title).toBe("壊れかけ");
    expect(result.feed.items[0].title).toBe("記事");
  });
});
