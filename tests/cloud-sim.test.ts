import { describe, expect, it } from "vitest";
import katex from "katex";
import { GENERA } from "@/lib/clouds";
import { SIMS, SIMS_BY_LEVEL, defaultParams } from "@/lib/cloud-sim";
import type { AnyCloudSim } from "@/lib/cloud-sim";
import { hasBalancedDollars, splitInlineMath } from "@/lib/clouds/text";

function parses(tex: string, displayMode: boolean): string | null {
  try {
    katex.renderToString(tex, { displayMode, throwOnError: true, strict: "ignore" });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** どんなメソッド呼び出し・プロパティ代入も受け付ける偽の 2D コンテキスト */
function fakeContext(): CanvasRenderingContext2D {
  const handler: ProxyHandler<object> = {
    get: (_t, key) => {
      if (key === "measureText") return () => ({ width: 10 });
      if (key === "canvas") return { width: 640, height: 360 };
      return fn;
    },
    set: () => true,
  };
  const fn: unknown = new Proxy(function () {}, {
    ...handler,
    apply: () => proxy,
  });
  const proxy = new Proxy({}, handler);
  return proxy as unknown as CanvasRenderingContext2D;
}

/** 状態の中に NaN / Infinity がないか（入れ子の配列・オブジェクト・型付き配列も見る） */
function findNonFinite(v: unknown, path = "state", seen = new Set<unknown>()): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== "object" || seen.has(v)) return null;
  seen.add(v);
  if (ArrayBuffer.isView(v)) {
    const arr = v as unknown as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return `${path}[${i}]`;
    return null;
  }
  for (const [k, child] of Object.entries(v)) {
    const r = findNonFinite(child, `${path}.${k}`, seen);
    if (r) return r;
  }
  return null;
}

function texts(sim: AnyCloudSim): string[] {
  return [sim.title, ...sim.description, ...sim.equations.map((e) => e.caption ?? "")];
}

describe("雲のでき方シミュレーション（共通）", () => {
  it("10種すべてにシミュレーションがあり、自分の層のファイルに置かれている", () => {
    expect(SIMS.map((s) => s.id).sort()).toEqual(GENERA.map((g) => g.id).sort());
    for (const [level, sims] of Object.entries(SIMS_BY_LEVEL)) {
      for (const s of sims) expect(GENERA.find((g) => g.id === s.id)?.level, s.id).toBe(level);
    }
  });

  for (const sim of SIMS) {
    describe(sim.id, () => {
      it("パラメータの初期値が範囲内", () => {
        for (const p of sim.params) {
          expect(p.value, p.key).toBeGreaterThanOrEqual(p.min);
          expect(p.value, p.key).toBeLessThanOrEqual(p.max);
          expect(p.step, p.key).toBeGreaterThan(0);
        }
        expect(new Set(sim.params.map((p) => p.key)).size).toBe(sim.params.length);
        expect(sim.timeScale).toBeGreaterThan(0);
        expect(sim.maxDt).toBeGreaterThan(0);
      });

      it("説明と数式が KaTeX で描画できる", () => {
        expect(sim.equations.length).toBeGreaterThan(0);
        for (const t of texts(sim)) {
          expect(hasBalancedDollars(t), t).toBe(true);
          for (const part of splitInlineMath(t))
            if (part.kind === "math") expect(parses(part.value, false), part.value).toBeNull();
        }
        for (const eq of sim.equations) expect(parses(eq.tex, true), eq.tex).toBeNull();
      });

      // 初期値・最小値・最大値のそれぞれで、表示上の約1分ぶん（速さ×1）を回しても壊れない
      const variants: [string, (p: AnyCloudSim["params"][number]) => number][] = [
        ["初期値", (p) => p.value],
        ["最小値", (p) => p.min],
        ["最大値", (p) => p.max],
      ];
      for (const [name, pick] of variants) {
        it(`${name}で回しても NaN にならず、描画とリードアウトが例外を出さない`, () => {
          const params = { ...defaultParams(sim) };
          for (const p of sim.params) params[p.key] = pick(p);
          const s = sim.init(params);
          const ctx = fakeContext();
          sim.draw(ctx, s, params, 640, 352);
          const total = Math.min(sim.timeScale * 60, sim.duration ?? Infinity);
          let t = 0;
          let steps = 0;
          while (t < total && steps < 20000) {
            const dt = Math.min(sim.maxDt, total - t);
            sim.step(s, params, dt);
            t += dt;
            steps++;
            if (steps % 500 === 0) sim.draw(ctx, s, params, 640, 352);
          }
          expect(findNonFinite(s)).toBeNull();
          expect(sim.time(s)).toBeGreaterThan(0);
          sim.draw(ctx, s, params, 320, 176);
          for (const r of sim.readouts(s, params)) {
            expect(r.value).not.toMatch(/NaN|Infinity|undefined/);
          }
        });
      }
    });
  }
});
