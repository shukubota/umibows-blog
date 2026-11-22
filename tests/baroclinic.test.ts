import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  TwoLayerQG,
  contourSegments,
  derive,
  fastestDomainMode,
  fft2d,
  linearGrowth,
  mulberry32,
  type BaroclinicParams,
} from "@/lib/baroclinic";

const fPlane: BaroclinicParams = { ...DEFAULT_PARAMS, beta: 0, drag: 0, jetWidth: Infinity };

describe("FFT", () => {
  it("2次元の順変換→逆変換で元に戻る", () => {
    const nx = 16;
    const ny = 8;
    const rand = mulberry32(3);
    const re = Float64Array.from({ length: nx * ny }, () => rand());
    const im = Float64Array.from({ length: nx * ny }, () => rand());
    const r0 = Float64Array.from(re);
    const i0 = Float64Array.from(im);
    fft2d(re, im, nx, ny, false);
    fft2d(re, im, nx, ny, true);
    for (let k = 0; k < re.length; k++) {
      expect(re[k]).toBeCloseTo(r0[k], 12);
      expect(im[k]).toBeCloseTo(i0[k], 12);
    }
  });

  it("cos 波は ±k の2か所だけに出る", () => {
    const nx = 32;
    const ny = 4;
    const re = new Float64Array(nx * ny);
    const im = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) re[j * nx + i] = Math.cos((2 * Math.PI * 3 * i) / nx);
    fft2d(re, im, nx, ny, false);
    expect(re[3]).toBeCloseTo((nx * ny) / 2, 8);
    expect(re[nx - 3]).toBeCloseTo((nx * ny) / 2, 8);
    expect(Math.abs(re[4])).toBeLessThan(1e-8);
  });
});

describe("線形理論", () => {
  it("変形半径は数百 km（典型的な中緯度の値）", () => {
    const { Ld } = derive(DEFAULT_PARAMS);
    expect(Ld / 1e3).toBeGreaterThan(300);
    expect(Ld / 1e3).toBeLessThan(700);
  });

  it("f 平面（β=0）では最大成長率が 0.207·U/L_d、波数 0.644/L_d（Phillips の解析解）", () => {
    const { Ld } = derive(fPlane);
    let best = { k: 0, sigma: 0 };
    for (let i = 1; i <= 4000; i++) {
      const k = i / 2000 / Ld;
      const g = linearGrowth(k, 0, fPlane);
      if (g.sigma > best.sigma) best = { k, sigma: g.sigma };
    }
    expect(best.k * Ld).toBeCloseTo(Math.sqrt(Math.sqrt(2) - 1), 2);
    expect((best.sigma * Ld) / fPlane.shear).toBeCloseTo(0.2071, 3);
  });

  it("温度差が小さく F(U1−U2) < β だと、どの波も育たない（臨界シア）", () => {
    const d = derive(DEFAULT_PARAMS);
    const critical = DEFAULT_PARAMS.beta / d.F;
    const weak = { ...DEFAULT_PARAMS, shear: critical * 0.95 };
    const strong = { ...DEFAULT_PARAMS, shear: critical * 1.5 };
    let maxWeak = 0;
    let maxStrong = 0;
    for (let i = 1; i <= 2000; i++) {
      const k = i / 500 / d.Ld;
      maxWeak = Math.max(maxWeak, linearGrowth(k, 0, weak).sigma);
      maxStrong = Math.max(maxStrong, linearGrowth(k, 0, strong).sigma);
    }
    expect(maxWeak).toBe(0);
    expect(maxStrong).toBeGreaterThan(0);
  });

  it("既定の設定では数千 km の波が1〜2日で e 倍に育つ", () => {
    const m = fastestDomainMode(DEFAULT_PARAMS, 16_000e3, 8_000e3);
    expect(m.lambda / 1e3).toBeGreaterThan(2500);
    expect(m.lambda / 1e3).toBeLessThan(6000);
    const eFoldDays = 1 / m.sigma / 86400;
    expect(eFoldDays).toBeGreaterThan(0.5);
    expect(eFoldDays).toBeLessThan(3);
  });
});

describe("数値モデル", () => {
  it("小さな波は線形理論どおりの速さで育つ", () => {
    const p: BaroclinicParams = { ...DEFAULT_PARAMS, drag: 0, jetWidth: Infinity };
    const model = new TwoLayerQG(p, { nx: 64, ny: 16 });
    const mode = fastestDomainMode(p, model.Lx, model.Ly, 20);
    model.seedMode(mode.n, 1e-4);
    const run = (days: number) => {
      const end = model.t + days * 86400;
      while (model.t < end - 1) model.step();
    };
    run(4); // 減衰するモードが消えるまで待つ
    const e0 = model.eddyKineticEnergy();
    const t0 = model.t;
    run(4);
    const e1 = model.eddyKineticEnergy();
    // エネルギーは振幅の2乗なので 2σ で育つ
    const sigma = Math.log(e1 / e0) / (2 * (model.t - t0));
    expect(sigma / mode.sigma).toBeGreaterThan(0.95);
    expect(sigma / mode.sigma).toBeLessThan(1.05);
  });

  it("育つ波では暖かい空気が昇り、冷たい空気が沈む（<w T'> > 0）", () => {
    const p: BaroclinicParams = { ...DEFAULT_PARAMS, drag: 0, jetWidth: Infinity };
    const model = new TwoLayerQG(p, { nx: 64, ny: 16 });
    model.seedMode(fastestDomainMode(p, model.Lx, model.Ly, 20).n, 1e-3);
    while (model.t < 6 * 86400) model.step();
    expect(model.warmRisingCorrelation()).toBeGreaterThan(0);
  });

  it("ランダムな擾乱から渦が育って有限の強さで落ち着き、上昇域に雲ができる", () => {
    const model = new TwoLayerQG(DEFAULT_PARAMS, { nx: 64, ny: 32 });
    model.seedRandom(7, 0.1);
    const e0 = model.eddyKineticEnergy();
    while (model.t < 25 * 86400) model.step();
    const e1 = model.eddyKineticEnergy();
    expect(Number.isFinite(e1)).toBe(true);
    expect(e1).toBeGreaterThan(e0 * 100);
    // 擾乱の風速が数 m/s〜数十 m/s（発散していない）
    const rms = Math.sqrt(2 * e1);
    expect(rms).toBeGreaterThan(2);
    expect(rms).toBeLessThan(80);
    // 鉛直流は cm/s のオーダー
    const wMax = Math.max(...model.w.map(Math.abs));
    expect(wMax).toBeGreaterThan(0.005);
    expect(wMax).toBeLessThan(0.5);
    const cover =
      model.highCloud.reduce((a, b) => a + (b > 0.5 ? 1 : 0), 0) / model.highCloud.length;
    expect(cover).toBeGreaterThan(0.02);
    expect(cover).toBeLessThan(0.8);
  });
});

describe("等値線", () => {
  it("円錐の場の等値線は半径の円の上に乗る", () => {
    const n = 21;
    const f = Float64Array.from({ length: n * n }, (_, k) =>
      Math.hypot((k % n) - 10, Math.floor(k / n) - 10)
    );
    const seg = contourSegments(f, n, n, 5);
    expect(seg.length).toBeGreaterThan(0);
    for (let s = 0; s < seg.length; s += 2) {
      expect(Math.hypot(seg[s] - 10, seg[s + 1] - 10)).toBeCloseTo(5, 0);
    }
  });
});

describe("本文", () => {
  it("すべての数式が KaTeX で描画でき、$ が対になっている", async () => {
    const katex = (await import("katex")).default;
    const { ALL_SECTIONS } = await import("@/lib/baroclinic-content");
    const { hasBalancedDollars, splitInlineMath } = await import("@/lib/clouds/text");
    for (const s of ALL_SECTIONS) {
      const texts = [
        s.heading,
        ...s.paragraphs,
        ...(s.after ?? []),
        ...(s.equations ?? []).map((e) => e.caption ?? ""),
      ];
      for (const t of texts) {
        expect(hasBalancedDollars(t), t).toBe(true);
        for (const part of splitInlineMath(t)) {
          if (part.kind === "math")
            katex.renderToString(part.value, { throwOnError: true, strict: "ignore" });
        }
      }
      for (const e of s.equations ?? [])
        katex.renderToString(e.tex, { displayMode: true, throwOnError: true, strict: "ignore" });
    }
  });
});
