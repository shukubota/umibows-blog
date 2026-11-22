import { describe, expect, it } from "vitest";
import { RD, T0, pressureAt, qsat } from "@/lib/cloud-sim/thermo";
import {
  altocumulusSim,
  firstLens,
  type AltocumulusState,
} from "@/lib/cloud-sim/scenarios/middle-altocumulus";
import {
  AS_U_REL,
  altostratusSim,
  cloudKind,
  columnCloud,
  observerXi,
  type AltostratusState,
} from "@/lib/cloud-sim/scenarios/middle-altostratus";
import {
  NS_CLOUD_BASE,
  NS_DZ,
  NS_NZ,
  cloudTop,
  nimbostratusSim,
  reflectivityDbz,
  type NimbostratusState,
} from "@/lib/cloud-sim/scenarios/middle-nimbostratus";
import { defaultParams } from "@/lib/cloud-sim";
import type { AnyCloudSim, Params } from "@/lib/cloud-sim";

function run<S>(sim: AnyCloudSim, p: Params, seconds: number, s?: S): S {
  const state = (s ?? sim.init(p)) as S;
  let t = 0;
  while (t < seconds - 1e-9) {
    const dt = Math.min(sim.maxDt, seconds - t);
    sim.step(state, p, dt);
    t += dt;
  }
  return state;
}

describe("高積雲（山岳波のレンズ雲）", () => {
  const p = defaultParams(altocumulusSim);

  it("雲は湿った層の流線がいちばん持ち上がった波の山にでき、その位置に止まっている", () => {
    const s = run<AltocumulusState>(altocumulusSim, p, 1800);
    // 山の風下で最初の波の山（η の極大）
    const xs = s.field.xs;
    let crest = 0;
    let best = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < -5000 || xs[i] > 15000) continue;
      if (s.etaMid[i] > best) {
        best = s.etaMid[i];
        crest = xs[i];
      }
    }
    expect(best).toBeGreaterThan(s.liftNeeded);
    const lens = firstLens(s);
    expect(lens).not.toBeNull();
    expect(Math.abs(lens!.xc - crest)).toBeLessThan(1500);
    // 雲の風上側の縁は上昇域（波の山の手前）、風下側の縁は下降域にある
    expect(lens!.x0).toBeLessThan(crest);
    expect(lens!.x1).toBeGreaterThan(crest);
    // 雲水をもつ空気塊は、必要な持ち上げ（125 m/K × 露点差）の 8 割以上持ち上がっている
    for (const q of s.parcels) {
      if (q.ql > 1e-5) expect(q.z - q.z0).toBeGreaterThan(0.8 * s.liftNeeded);
    }

    // 30 分後: 空気は 20 km 以上流れたが、雲の位置はほとんど変わらない
    const before = s.parcels.map((q) => ({ x: q.x, ql: q.ql }));
    run(altocumulusSim, p, 1800, s);
    const lens2 = firstLens(s);
    expect(lens2).not.toBeNull();
    expect(Math.abs(lens2!.xc - lens!.xc)).toBeLessThan(600);
    // 30 分前に雲の中にいた空気塊は、波の山を通り過ぎて雲から出ている
    let wasInLens = 0;
    let stillCloudy = 0;
    s.parcels.forEach((q, i) => {
      const b = before[i];
      if (b.ql > 1e-5 && b.x > lens!.x0 && b.x < lens!.x1 && q.x > b.x) {
        wasInLens++;
        expect(q.x - b.x).toBeCloseTo(p.U * 1800, 3);
        if (q.ql > 1e-5 && q.x < lens!.x1) stillCloudy++;
      }
    });
    expect(wasInLens).toBeGreaterThan(10);
    expect(stillCloudy).toBe(0);
  });

  it("空気塊の全水量（水蒸気＋雲水）は保存される", () => {
    const s0 = altocumulusSim.init(p) as AltocumulusState;
    const qt0 = s0.parcels.map((q) => q.qv + q.ql);
    const s = run<AltocumulusState>(altocumulusSim, p, 300, s0);
    s.parcels.forEach((q, i) => expect(q.qv + q.ql).toBeCloseTo(qt0[i], 9));
  });

  it("露点差が大きい（持ち上げが足りない）と雲はできない", () => {
    const dry = { ...p, dd: 8 };
    const s = run<AltocumulusState>(altocumulusSim, dry, 1800);
    expect(Math.max(...s.etaMid)).toBeLessThan(s.liftNeeded);
    expect(firstLens(s)).toBeNull();
    // 雲として描く量（0.01 g/kg）を超える空気塊はない
    expect(s.parcels.every((q) => q.ql <= 1e-5)).toBe(true);
  });
});

describe("高層雲（温暖前線）", () => {
  const p = defaultParams(altostratusSim);
  const slope = 1 / p.slope;

  it("観測者の真上の雲底は、前線からの距離 × 傾きに合い、巻雲→巻層雲→高層雲→乱層雲と下がる", () => {
    const s = altostratusSim.init(p) as AltostratusState;
    const kinds: string[] = [];
    let prevBase = Infinity;
    for (let hour = 3; hour <= 30; hour += 3) {
      run(altostratusSim, p, 3 * 3600, s);
      const xo = observerXi(s, p);
      const col = columnCloud(s, xo);
      expect(col, `${hour} 時間後`).not.toBeNull();
      // 空気塊の間隔 10 km 分の誤差（10 km × 傾き）まで許す
      expect(Math.abs(col!.base - xo * slope)).toBeLessThan(10e3 * slope + 20);
      expect(col!.base).toBeLessThan(prevBase);
      prevBase = col!.base;
      const k = cloudKind(col!.base);
      if (kinds[kinds.length - 1] !== k) kinds.push(k);
    }
    expect(kinds).toEqual(["巻雲", "巻層雲", "高層雲", "乱層雲"]);
  });

  it("前線面に沿った上昇速度は U tanα", () => {
    const s = altostratusSim.init(p) as AltostratusState;
    const q = s.parcels.find((x) => x.xi > 200e3 && x.xi < 300e3 && x.d === 0)!;
    const z0 = q.z;
    run(altostratusSim, p, 600, s);
    expect((q.z - z0) / 600).toBeCloseTo(AS_U_REL * slope, 6);
  });

  it("暖気が乾いていると、前線近くの雲のない範囲が持ち上げ凝結高度 / 傾き の分だけ広がる", () => {
    const edge = (rh: number) => {
      const s = altostratusSim.init({ ...p, rh }) as AltostratusState;
      for (let xi = 0; xi < 1000e3; xi += 5e3) if (columnCloud(s, xi, 5e3)) return xi;
      return Infinity;
    };
    const moist = edge(95);
    const dry = edge(50);
    // 地上 18 ℃ の空気の露点差から見積もった持ち上げ凝結高度（125 m/K）
    const lcl = (rh: number) => {
      const T = 291.15;
      const e = (rh / 100) * 611.2 * Math.exp((17.67 * (T - T0)) / (T - T0 + 243.5));
      const x = Math.log(e / 611.2);
      const Td = (243.5 * x) / (17.67 - x) + T0;
      return 125 * (T - Td);
    };
    expect(dry).toBeGreaterThan(moist + 100e3);
    expect(Math.abs(dry - lcl(50) / slope)).toBeLessThan(0.15 * (lcl(50) / slope));
    expect(Math.abs(moist - lcl(95) / slope)).toBeLessThan(20e3);
  });
});

describe("乱層雲（層状性の降水とブライトバンド）", () => {
  const p = defaultParams(nimbostratusSim);
  const s = run<NimbostratusState>(nimbostratusSim, p, 10 * 3600);
  const zOf = (i: number) => (i + 0.5) * NS_DZ;
  const idx = (z: number) => Math.floor(z / NS_DZ);
  const z0c = p.z0c * 1000;

  it("定常の地上降水強度は、凝結量の鉛直積分 ρ_b w (q_s(雲底) − q_s(雲頂)) と一致する", () => {
    const Ts = T0 + 0.0065 * z0c;
    const temp = (z: number) => T0 + 0.0065 * (z0c - z);
    const qs = (z: number) => qsat(temp(z), pressureAt(z, Ts, 0.0065));
    const top = cloudTop(p);
    const rhoB = pressureAt(NS_CLOUD_BASE, Ts, 0.0065) / (RD * temp(NS_CLOUD_BASE));
    const expected = rhoB * p.w * (qs(NS_CLOUD_BASE) - qs(top)) * 3600; // mm/h
    expect(s.condInt).toBeCloseTo(expected, 6);
    expect(expected).toBeGreaterThan(2);
    expect(expected).toBeLessThan(5);
    expect(Math.abs(s.rain - expected) / expected).toBeLessThan(0.01);
  });

  it("融解層の下で落下速度が約 1 m/s から数 m/s に増える", () => {
    expect(s.v[idx(z0c + 300)]).toBeCloseTo(1, 5);
    expect(s.v[idx(300)]).toBeGreaterThan(2.5);
    expect(s.v[idx(300)]).toBeLessThan(9);
  });

  it("0 ℃ 高度より下では、粒の数のフラックス n v が保存される（雪片の数 = 雨粒の数）", () => {
    const iTop = idx(z0c) - 1;
    const ref = s.n[iTop] * s.v[iTop];
    expect(ref).toBeGreaterThan(100);
    for (let i = 0; i <= iTop; i++) {
      expect(Math.abs(s.n[i] * s.v[i] - ref) / ref, `z=${zOf(i)}`).toBeLessThan(0.005);
    }
    // 融けると数密度が減る（n_snow v_snow = n_rain v_rain）
    expect(s.n[idx(300)]).toBeLessThan(0.5 * s.n[iTop]);
    // 雲底より下では質量フラックスも保存され、地上の降水強度に等しい
    const fluxAt = (i: number) => (s.ms[i] + s.mr[i]) * s.v[i] * 3600;
    for (let i = 0; i < idx(NS_CLOUD_BASE); i++) {
      expect(Math.abs(fluxAt(i) - s.rain) / s.rain).toBeLessThan(0.005);
    }
  });

  it("反射因子は 0 ℃ 高度のすぐ下（融解層）でいちばん強い（ブライトバンド）", () => {
    let best = -Infinity;
    let iBest = 0;
    for (let i = 0; i < NS_NZ; i++) {
      const d = reflectivityDbz(s, i);
      if (d > best) {
        best = d;
        iBest = i;
      }
    }
    expect(zOf(iBest)).toBeLessThan(z0c);
    expect(zOf(iBest)).toBeGreaterThan(z0c - 700);
    expect(best - reflectivityDbz(s, idx(300))).toBeGreaterThan(5);
    expect(best - reflectivityDbz(s, idx(z0c + 500))).toBeGreaterThan(5);
  });
});
