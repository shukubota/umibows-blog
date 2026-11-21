import type { CloudGenus, CloudLevel } from "./types";

// WMO の十種雲形。高さは中緯度でのおおよその範囲（上層 5〜13 km、中層 2〜7 km、下層 0〜2 km）。
export const GENERA: CloudGenus[] = [
  {
    id: "cirrus",
    abbr: "Ci",
    nameJa: "巻雲",
    latin: "Cirrus",
    nicknames: ["すじ雲"],
    level: "high",
    altitudeKm: [6, 12],
  },
  {
    id: "cirrocumulus",
    abbr: "Cc",
    nameJa: "巻積雲",
    latin: "Cirrocumulus",
    nicknames: ["うろこ雲", "いわし雲", "さば雲"],
    level: "high",
    altitudeKm: [6, 10],
  },
  {
    id: "cirrostratus",
    abbr: "Cs",
    nameJa: "巻層雲",
    latin: "Cirrostratus",
    nicknames: ["うす雲"],
    level: "high",
    altitudeKm: [6, 11],
  },
  {
    id: "altocumulus",
    abbr: "Ac",
    nameJa: "高積雲",
    latin: "Altocumulus",
    nicknames: ["ひつじ雲", "むら雲"],
    level: "middle",
    altitudeKm: [2.5, 6],
  },
  {
    id: "altostratus",
    abbr: "As",
    nameJa: "高層雲",
    latin: "Altostratus",
    nicknames: ["おぼろ雲"],
    level: "middle",
    altitudeKm: [2.5, 6.5],
  },
  {
    id: "nimbostratus",
    abbr: "Ns",
    nameJa: "乱層雲",
    latin: "Nimbostratus",
    nicknames: ["あま雲", "ゆき雲"],
    level: "middle",
    altitudeKm: [0.6, 6],
  },
  {
    id: "stratocumulus",
    abbr: "Sc",
    nameJa: "層積雲",
    latin: "Stratocumulus",
    nicknames: ["うね雲", "くもり雲"],
    level: "low",
    altitudeKm: [0.5, 2],
  },
  {
    id: "stratus",
    abbr: "St",
    nameJa: "層雲",
    latin: "Stratus",
    nicknames: ["きり雲"],
    level: "low",
    altitudeKm: [0, 0.8],
  },
  {
    id: "cumulus",
    abbr: "Cu",
    nameJa: "積雲",
    latin: "Cumulus",
    nicknames: ["わた雲", "にゅうどう雲（雄大積雲）"],
    level: "vertical",
    altitudeKm: [0.8, 5],
  },
  {
    id: "cumulonimbus",
    abbr: "Cb",
    nameJa: "積乱雲",
    latin: "Cumulonimbus",
    nicknames: ["入道雲", "かみなり雲"],
    level: "vertical",
    altitudeKm: [0.8, 13],
  },
];

export const LEVEL_LABEL: Record<CloudLevel, string> = {
  high: "上層雲（5〜13 km）",
  middle: "中層雲（2〜7 km）",
  low: "下層雲（0〜2 km）",
  vertical: "対流雲（雲底は下層、雲頂は上層まで）",
};

export const LEVEL_ORDER: CloudLevel[] = ["high", "middle", "low", "vertical"];
