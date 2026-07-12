/**
 * View 側で扱う何切るの型。server.ts の structuredContent と対応する。
 */
export type Reco = {
  index: number;
  name: string;
  shanten: number;
  ukeire: number;
};

export type Hand = {
  tiles: number[];
  names: string[];
  count: number;
  shanten: number;
  mode: "discard" | "improve" | "complete" | "invalid";
  recommend: Reco[];
  unknown: string[];
};
