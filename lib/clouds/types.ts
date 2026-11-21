// 十種雲形ページのデータ型。
// 本文の文字列では $...$ で囲んだ部分をインライン数式（TeX）として描画する。
// 文字としての $ は使えない（金額などは「ドル」と書く）。

export type CloudLevel = "high" | "middle" | "low" | "vertical";

export type CloudId =
  | "cirrus"
  | "cirrocumulus"
  | "cirrostratus"
  | "altocumulus"
  | "altostratus"
  | "nimbostratus"
  | "stratocumulus"
  | "stratus"
  | "cumulus"
  | "cumulonimbus";

/** 別行立ての数式。tex は displayMode で描画する。 */
export interface MathBlock {
  tex: string;
  /** 式の下に添える短い説明（インライン数式可） */
  caption?: string;
}

export interface CloudSection {
  /** 小見出し（インライン数式可） */
  heading: string;
  /** 段落（インライン数式可）。数式ブロックより前に表示する。 */
  paragraphs: string[];
  equations?: MathBlock[];
  /** 数式ブロックの後に続ける段落（インライン数式可） */
  after?: string[];
}

/** 各雲の本文。メタ情報（名前・高さ）は genera.ts にある。 */
export interface CloudArticle {
  id: CloudId;
  /** 冒頭の2〜3文の要約（インライン数式可） */
  summary: string;
  /** 見分け方の要点（箇条書き、インライン数式可） */
  identify: string[];
  sections: CloudSection[];
}

export interface CloudGenus {
  id: CloudId;
  abbr: string;
  nameJa: string;
  latin: string;
  nicknames: string[];
  level: CloudLevel;
  /** 中緯度でのおおよその雲底〜雲頂の高さ [km] */
  altitudeKm: [number, number];
}
