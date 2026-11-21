import type { CloudArticle, CloudLevel, CloudSection } from "./types";
import { basicsSections } from "./content/basics";
import { highClouds } from "./content/high";
import { middleClouds } from "./content/middle";
import { lowClouds } from "./content/low";
import { verticalClouds } from "./content/vertical";

export { GENERA, LEVEL_LABEL, LEVEL_ORDER } from "./genera";
export type * from "./types";

/** 雲ができるしくみ（全雲に共通の物理） */
export const BASICS: CloudSection[] = basicsSections;

/** 層ごとの本文。各ファイルは自分の層の雲だけを持つ。 */
export const ARTICLES_BY_LEVEL: Record<CloudLevel, CloudArticle[]> = {
  high: highClouds,
  middle: middleClouds,
  low: lowClouds,
  vertical: verticalClouds,
};

export const ARTICLES: CloudArticle[] = Object.values(ARTICLES_BY_LEVEL).flat();
