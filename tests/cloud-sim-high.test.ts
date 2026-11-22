import { describe, expect, it } from "vitest";
import { CELL_BOTTOM, cirrusSim } from "@/lib/cloud-sim/scenarios/high-cirrus";
import type { CirrusState } from "@/lib/cloud-sim/scenarios/high-cirrus";
import {
  cirrocumulusSim,
  khAmplitude,
  khBuoyancyJump,
  khGrowthRate,
  khGrowthRateMode,
  khHalfHeight,
  khIceWater,
  khStep,
  KH_K,
  KH_N,
} from "@/lib/cloud-sim/scenarios/high-cirrocumulus";
import type { KHState } from "@/lib/cloud-sim/scenarios/high-cirrocumulus";
import {
  cirrostratusSim,
  csEnvTemperature,
  csInitialRhi,
  csOpticalDepth,
  csSaturationTimeEstimate,
  CS_DZ,
  CS_LEVELS,
  CS_Z_FIRST,
} from "@/lib/cloud-sim/scenarios/high-cirrostratus";
import type { CSState } from "@/lib/cloud-sim/scenarios/high-cirrostratus";
import { CP, GAMMA_D, LS } from "@/lib/cloud-sim/thermo";
import type { Params } from "@/lib/cloud-sim";

function runCirrus(p: Params, seconds: number): CirrusState {
  const s = cirrusSim.init(p) as CirrusState;
  for (let t = 0; t < seconds; t += cirrusSim.maxDt) cirrusSim.step(s, p, cirrusSim.maxDt);
  return s;
}

function alive(s: CirrusState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) out.push(i);
  return out;
}

describe("巻雲（尾流雲）", () => {
  it("シアが 0 なら氷晶はまっすぐ下に落ちる（水平にずれない）", () => {
    const s = runCirrus({ shear: 0, rhiTop: 125, rhiLow: 100 }, 3 * 3600);
    const ids = alive(s);
    expect(ids.length).toBeGreaterThan(100);
    expect(Math.min(...ids.map((i) => s.z[i]))).toBeLessThan(CELL_BOTTOM - 1000);
    for (const i of ids) expect(Math.abs(s.x[i] - s.x0[i])).toBeLessThan(1e-9);
  });

  it("シアがあると、深く落ちた結晶ほど後ろに取り残されて尾が曲がる", () => {
    const s = runCirrus({ shear: 4, rhiTop: 125, rhiLow: 100 }, 3 * 3600);
    const ids = alive(s);
    const shallow = ids.filter((i) => s.z[i] > CELL_BOTTOM - 300 && s.z[i] < CELL_BOTTOM);
    const deep = ids.filter((i) => s.z[i] < CELL_BOTTOM - 1500);
    expect(shallow.length).toBeGreaterThan(5);
    expect(deep.length).toBeGreaterThan(5);
    const meanShift = (list: number[]) =>
      list.reduce((a, i) => a + (s.x[i] - s.x0[i]), 0) / list.length;
    expect(meanShift(deep)).toBeLessThan(-3000);
    expect(meanShift(deep)).toBeLessThan(meanShift(shallow) - 2000);
  });

  it("下層が乾いていると結晶は途中で昇華して消え、湿っていると下まで届く", () => {
    const dry = runCirrus({ shear: 4, rhiTop: 125, rhiLow: 60 }, 3 * 3600);
    const wet = runCirrus({ shear: 4, rhiTop: 125, rhiLow: 105 }, 3 * 3600);
    const zMin = (s: CirrusState) => Math.min(...alive(s).map((i) => s.z[i]));
    expect(dry.sublimated).toBeGreaterThan(100);
    expect(zMin(dry)).toBeGreaterThan(7500);
    expect(wet.sublimated).toBe(0);
    expect(zMin(wet)).toBeLessThan(6500);
  });

  it("発生セルの過飽和が大きいほど結晶は大きく育つ（氷飽和ちょうどなら育たない）", () => {
    const maxD = (rhiTop: number) => {
      const s = runCirrus({ shear: 4, rhiTop, rhiLow: 80 }, 2 * 3600);
      return Math.sqrt(Math.max(...alive(s).map((i) => s.D2[i])));
    };
    expect(maxD(100)).toBeLessThan(11e-6);
    expect(maxD(120)).toBeGreaterThan(100e-6);
    expect(maxD(140)).toBeGreaterThan(maxD(120));
  });
});

/** 振幅をとても小さくして、線形の段階の成長率を測る */
function measureKHGrowth(dU: number, gPrime: number, delta: number): number {
  const s = cirrocumulusSim.init({ dU, Ri: 0, rhi: 97 }) as KHState;
  for (let j = 0; j < KH_N; j++) s.y[j] *= 1e-6;
  let a1 = 0;
  for (let t = 0; t < 400; t++) {
    khStep(s, gPrime, 1, delta);
    if (t === 199) a1 = khAmplitude(s);
  }
  return Math.log(khAmplitude(s) / a1) / 200;
}

describe("巻積雲（ケルビン＝ヘルムホルツ不安定）", () => {
  it("ぼかし δ → 0 で線形成長率は渦シートの理論値 kΔU/2 になる", () => {
    for (const dU of [2, 5, 8]) {
      expect(khGrowthRateMode(dU, 0, 1, 1e-4) / ((KH_K * dU) / 2)).toBeCloseTo(1, 3);
    }
  });

  it("成層なしの線形段階の成長率が、点渦モデルの理論値と合い、δ が小さいほど kΔU/2 に近づく", () => {
    const dU = 5;
    const sharp = (KH_K * dU) / 2;
    const m15 = measureKHGrowth(dU, 0, 0.15);
    const m50 = measureKHGrowth(dU, 0, 0.5);
    expect(m15 / khGrowthRateMode(dU, 0, 1, 0.15)).toBeCloseTo(1, 1);
    expect(m50 / khGrowthRateMode(dU, 0, 1, 0.5)).toBeCloseTo(1, 1);
    expect(Math.abs(m15 / sharp - 1)).toBeLessThan(0.2);
    expect(m15).toBeGreaterThan(m50);
  });

  it("成層があると成長が遅くなり、その成長率も理論値と合う", () => {
    const dU = 5;
    const Ri = 0.08;
    const s = cirrocumulusSim.init({ dU, Ri, rhi: 97 }) as KHState;
    for (let j = 0; j < KH_N; j++) s.y[j] *= 1e-6;
    let a1 = 0;
    const p = { dU, Ri, rhi: 97 };
    for (let t = 0; t < 600; t++) {
      cirrocumulusSim.step(s, p, 1);
      if (t === 199) a1 = khAmplitude(s);
    }
    const measured = Math.log(khAmplitude(s) / a1) / 400;
    const theory = khGrowthRate(dU, Ri);
    expect(theory).toBeLessThan(khGrowthRate(dU, 0) * 0.7);
    expect(Math.abs(measured / theory - 1)).toBeLessThan(0.1);
  });

  it("Ri ≥ 1/4 では波が育たず、雲もできない", () => {
    for (const Ri of [0.25, 0.3, 0.4]) {
      expect(khGrowthRate(8, Ri)).toBe(0);
      // 短い波（n = 2〜40）もすべて安定
      for (let n = 2; n <= KH_N / 2; n++) {
        expect(khGrowthRateMode(8, khBuoyancyJump(8, Ri), n)).toBe(0);
      }
      const p = { dU: 8, Ri, rhi: 97 };
      const s = cirrocumulusSim.init(p) as KHState;
      let maxH = 0;
      for (let t = 0; t < 900; t++) {
        cirrocumulusSim.step(s, p, 1);
        maxH = Math.max(maxH, khHalfHeight(s));
      }
      expect(maxH).toBeLessThan(3 * 4);
      let qMax = 0;
      for (let j = 0; j < KH_N; j++) qMax = Math.max(qMax, khIceWater(s.y[j], 0.97));
      expect(qMax).toBe(0);
    }
  });

  it("Ri が小さいと巻き上がり、持ち上げられた山の部分だけが氷飽和して雲になる", () => {
    const p = { dU: 5, Ri: 0.03, rhi: 97 };
    const s = cirrocumulusSim.init(p) as KHState;
    for (let t = 0; t < 400; t++) cirrocumulusSim.step(s, p, 1);
    expect(khHalfHeight(s)).toBeGreaterThan(50);
    let cloudy = 0;
    for (let j = 0; j < KH_N; j++) {
      const q = khIceWater(s.y[j], 0.97);
      if (q > 0) {
        cloudy++;
        expect(s.y[j]).toBeGreaterThan(0);
      }
    }
    expect(cloudy).toBeGreaterThan(5);
    expect(cloudy).toBeLessThan(KH_N);
  });
});

function runCS(p: Params, seconds: number): CSState {
  const s = cirrostratusSim.init(p) as CSState;
  for (let t = 0; t < seconds; t += cirrostratusSim.maxDt)
    cirrostratusSim.step(s, p, cirrostratusSim.maxDt);
  return s;
}

describe("巻層雲（ゆっくり持ち上げられる湿った層）", () => {
  it("氷飽和に達する時刻が解析的な見積もりと合う", () => {
    const k = Math.round((8500 - CS_Z_FIRST) / CS_DZ);
    for (const [w, rhi] of [
      [3, 75],
      [5, 75],
      [3, 90],
    ]) {
      const s = runCS({ w, rhi, ni: 50 }, 6 * 3600);
      const z0 = CS_Z_FIRST + k * CS_DZ;
      const est = csSaturationTimeEstimate(
        csEnvTemperature(z0),
        csInitialRhi(z0, rhi / 100),
        w / 100
      );
      expect(s.tSat[k]).toBeGreaterThan(0);
      expect(Math.abs(s.tSat[k] / est - 1)).toBeLessThan(0.03);
    }
  });

  it("上昇がなければ雲はできない", () => {
    const s = runCS({ w: 0, rhi: 100, ni: 50 }, 8 * 3600);
    for (let k = 0; k < CS_LEVELS; k++) expect(s.qi[k]).toBe(0);
    expect(csOpticalDepth(s)).toBe(0);
  });

  it("水の総量は保存され、気温は乾燥断熱の冷却 + 昇華の潜熱で決まる", () => {
    const p = { w: 3, rhi: 75, ni: 50 };
    const s0 = cirrostratusSim.init(p) as CSState;
    const s = runCS(p, 8 * 3600);
    for (let k = 0; k < CS_LEVELS; k++) {
      expect(s.qv[k] + s.qi[k]).toBeCloseTo(s0.qv[k], 9);
      const expected = s0.T[k] - GAMMA_D * (s.z[k] - s0.z[k]) + (LS / CP) * s.qi[k];
      expect(s.T[k]).toBeCloseTo(expected, 6);
    }
  });

  it("はじめは τ が小さく（ハロの出る巻層雲）、厚くなると高層雲へ移る。氷晶が多いほど τ は大きい", () => {
    const p = { w: 3, rhi: 75, ni: 50 };
    const s = cirrostratusSim.init(p) as CSState;
    let sawThin = false;
    for (let t = 0; t < 8 * 3600; t += 30) {
      cirrostratusSim.step(s, p, 30);
      const tau = csOpticalDepth(s);
      if (tau > 0.05 && tau < 1) sawThin = true;
    }
    expect(sawThin).toBe(true);
    expect(csOpticalDepth(s)).toBeGreaterThan(3);
    const many = runCS({ w: 3, rhi: 75, ni: 200 }, 6 * 3600);
    const few = runCS({ w: 3, rhi: 75, ni: 10 }, 6 * 3600);
    expect(csOpticalDepth(many)).toBeGreaterThan(1.5 * csOpticalDepth(few));
  });
});
