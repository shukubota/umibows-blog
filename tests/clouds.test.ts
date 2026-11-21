import { describe, expect, it } from "vitest";
import katex from "katex";
import { ARTICLES, ARTICLES_BY_LEVEL, BASICS, GENERA } from "@/lib/clouds";
import type { CloudSection } from "@/lib/clouds";
import { hasBalancedDollars, splitInlineMath } from "@/lib/clouds/text";

// 本文に出てくる文字列をすべて集める（インライン数式を含みうるもの）
function sectionTexts(s: CloudSection): string[] {
  return [
    s.heading,
    ...s.paragraphs,
    ...(s.after ?? []),
    ...(s.equations ?? []).map((e) => e.caption ?? ""),
  ];
}
const richTexts: { where: string; text: string }[] = [
  ...BASICS.flatMap((s) => sectionTexts(s).map((text) => ({ where: "basics", text }))),
  ...ARTICLES.flatMap((a) =>
    [a.summary, ...a.identify, ...a.sections.flatMap(sectionTexts)].map((text) => ({
      where: a.id,
      text,
    }))
  ),
];
const displayTex: { where: string; tex: string }[] = [
  ...BASICS.flatMap((s) => (s.equations ?? []).map((e) => ({ where: "basics", tex: e.tex }))),
  ...ARTICLES.flatMap((a) =>
    a.sections.flatMap((s) => (s.equations ?? []).map((e) => ({ where: a.id, tex: e.tex })))
  ),
];

function parses(tex: string, displayMode: boolean): string | null {
  try {
    katex.renderToString(tex, { displayMode, throwOnError: true, strict: "ignore" });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe("十種雲形のデータ", () => {
  it("WMO の10種がそろい、略号が重複しない", () => {
    expect(GENERA).toHaveLength(10);
    expect(new Set(GENERA.map((g) => g.abbr)).size).toBe(10);
    expect(new Set(GENERA.map((g) => g.id)).size).toBe(10);
  });

  it("10種すべての本文と「雲ができるしくみ」がそろっている", () => {
    expect(BASICS.length).toBeGreaterThan(0);
    expect(ARTICLES.map((a) => a.id).sort()).toEqual(GENERA.map((g) => g.id).sort());
  });

  it("各雲の本文は1つだけで、自分の層のファイルに置かれている", () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    for (const [level, articles] of Object.entries(ARTICLES_BY_LEVEL)) {
      for (const a of articles) {
        expect(GENERA.find((g) => g.id === a.id)?.level, a.id).toBe(level);
      }
    }
  });

  it("本文の $ は対になっている", () => {
    for (const { where, text } of richTexts) {
      expect(hasBalancedDollars(text), `${where}: ${text}`).toBe(true);
    }
  });

  it("インライン数式はすべて KaTeX で描画できる", () => {
    for (const { where, text } of richTexts) {
      for (const part of splitInlineMath(text)) {
        if (part.kind === "math")
          expect(parses(part.value, false), `${where}: ${part.value}`).toBeNull();
      }
    }
  });

  it("別行立ての数式はすべて KaTeX で描画できる", () => {
    for (const { where, tex } of displayTex) {
      expect(parses(tex, true), `${where}: ${tex}`).toBeNull();
    }
  });
});
