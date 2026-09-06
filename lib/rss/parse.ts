import { XMLParser } from "fast-xml-parser";
import { FEED_LIMITS, type Feed, type FeedItem } from "./types";

export type ParseFeedResult =
  { ok: true; feed: Feed } | { ok: false; error: "not_feed"; message: string };

const NOT_FEED = {
  ok: false as const,
  error: "not_feed" as const,
  message: "RSS / Atom フィードの XML ではないようです",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // タイトルが "2024" のようなフィードもあるため、値は数値化せず文字列のまま扱う
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  // HTML を含みがちな要素は中身をパースせず生文字列として受け取る
  // （エスケープ漏れの HTML でフィード全体のパースが失敗するのを避ける）
  stopNodes: ["*.description", "*.content:encoded", "*.summary", "*.content"],
});

type XmlNode = Record<string, unknown>;

function isNode(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function unwrapCdata(value: string): string {
  return value.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}

/** 文字列 / `{ "#text": ... }` / 配列のいずれで来ても素のテキストを取り出す */
function text(value: unknown): string {
  const node = first(value);
  if (typeof node === "string") return unwrapCdata(node).trim();
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (isNode(node)) {
    const inner = node["#text"];
    if (typeof inner === "string") return unwrapCdata(inner).trim();
    if (typeof inner === "number") return String(inner);
  }
  return "";
}

function attr(value: unknown, name: string): string {
  const node = first(value);
  if (!isNode(node)) return "";
  const raw = node[`@_${name}`];
  return typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
}

/** 最初に空でない値を返す（フィールドのフォールバック順を素直に書くため） */
function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    if (value) return value;
  }
  return "";
}

function resolveUrl(href: string, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(value: string): string {
  // 1 パスで置換するため `&amp;lt;` が `<` まで戻ることはない
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function stripTags(value: string): string {
  return unwrapCdata(value)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

/**
 * 概要テキストを組み立てる。HTML はタグを落としてプレーンテキストにする
 * （HTML をそのまま描画しない = サニタイザを持たずに XSS を避ける）。
 */
function summarize(raw: string): string | undefined {
  if (!raw) return undefined;
  // stopNodes の中身は XML の実体参照が未展開なので、
  // 「XML 層を展開 → タグ除去 → HTML 層を展開」の順に 2 段で素のテキストへ落とす
  const plain = decodeEntities(stripTags(decodeEntities(raw)))
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > FEED_LIMITS.summaryLength
    ? `${plain.slice(0, FEED_LIMITS.summaryLength)}…`
    : plain;
}

/** Atom の `<link>` から本文へのリンクを選ぶ。rel=alternate 優先、self / enclosure は除外 */
function atomLink(value: unknown, baseUrl: string): string | undefined {
  const links = toArray(value);
  const candidates = links.filter((link) => {
    const rel = attr(link, "rel");
    return rel === "" || rel === "alternate";
  });
  for (const link of [...candidates, ...links]) {
    const href = firstNonEmpty(attr(link, "href"), text(link));
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function buildItem(
  item: unknown,
  index: number,
  baseUrl: string,
  format: Feed["format"]
): FeedItem {
  const node = isNode(item) ? item : {};

  const link =
    format === "atom"
      ? atomLink(node.link, baseUrl)
      : resolveUrl(
          firstNonEmpty(text(node.link), attr(node.link, "href"), attr(node, "rdf:about")),
          baseUrl
        );

  const publishedAt =
    format === "atom"
      ? normalizeDate(firstNonEmpty(text(node.published), text(node.updated), text(node.issued)))
      : normalizeDate(firstNonEmpty(text(node.pubDate), text(node["dc:date"]), text(node.date)));

  const author =
    format === "atom"
      ? firstNonEmpty(
          text(isNode(first(node.author)) ? (first(node.author) as XmlNode).name : ""),
          text(node.author)
        )
      : firstNonEmpty(text(node.author), text(node["dc:creator"]));

  const summary =
    format === "atom"
      ? summarize(firstNonEmpty(text(node.summary), text(node.content)))
      : summarize(firstNonEmpty(text(node.description), text(node["content:encoded"])));

  const id = firstNonEmpty(
    format === "atom" ? text(node.id) : text(node.guid),
    link ?? "",
    `${baseUrl}#${index}`
  );

  return {
    id,
    title: firstNonEmpty(text(node.title), link ?? "", "(タイトルなし)"),
    link,
    publishedAt,
    author: author || undefined,
    summary,
  };
}

/**
 * RSS 2.0 / RSS 1.0 (RDF) / Atom の XML を共通の `Feed` に正規化する。
 * 相対 URL は `baseUrl`（フィードの取得元）を基準に解決する。
 */
export function parseFeed(xml: string, baseUrl: string): ParseFeedResult {
  if (!xml.trim()) return NOT_FEED;

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return NOT_FEED;
  }
  if (!isNode(doc)) return NOT_FEED;

  const rss = first(doc.rss);
  const rdf = first(doc["rdf:RDF"] ?? doc.RDF);
  const atom = first(doc.feed);

  let format: Feed["format"];
  let channel: XmlNode;
  let rawItems: unknown[];

  if (isNode(rss)) {
    format = "rss";
    const ch = first(rss.channel);
    channel = isNode(ch) ? ch : {};
    rawItems = toArray(channel.item ?? rss.item);
  } else if (isNode(rdf)) {
    format = "rss";
    const ch = first(rdf.channel);
    channel = isNode(ch) ? ch : {};
    rawItems = toArray(rdf.item ?? channel.item);
  } else if (isNode(atom)) {
    format = "atom";
    channel = atom;
    rawItems = toArray(atom.entry);
  } else {
    return NOT_FEED;
  }

  const siteUrl =
    format === "atom"
      ? atomLink(channel.link, baseUrl)
      : resolveUrl(firstNonEmpty(text(channel.link), attr(channel.link, "href")), baseUrl);

  let fallbackTitle = baseUrl;
  try {
    fallbackTitle = new URL(baseUrl).hostname;
  } catch {
    // baseUrl が URL でないケースはテスト以外では起きないため、そのまま使う
  }

  const items = rawItems
    .slice(0, FEED_LIMITS.maxItems)
    .map((item, index) => buildItem(item, index, baseUrl, format));

  return {
    ok: true,
    feed: {
      title: firstNonEmpty(text(channel.title), fallbackTitle),
      siteUrl,
      description: summarize(
        firstNonEmpty(text(channel.description), text(channel.subtitle), text(channel.tagline))
      ),
      format,
      items,
    },
  };
}
