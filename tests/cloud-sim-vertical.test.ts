import { describe, expect, it } from "vitest";
import { defaultParams } from "@/lib/cloud-sim";
import type { AnyCloudSim, Params } from "@/lib/cloud-sim";
import { CP, G, T0, lclHeight } from "@/lib/cloud-sim/thermo";
import { envAt, type ParcelProfile } from "@/lib/cloud-sim/scenarios/vertical-parcel";
import { CU_TD, cumulusSim } from "@/lib/cloud-sim/scenarios/vertical-cumulus";
import {
  CB_W0,
  CB_Z_TROP,
  cumulonimbusEnv,
  cumulonimbusSim,
  terminalVelocity,
} from "@/lib/cloud-sim/scenarios/vertical-cumulonimbus";

function run(sim: AnyCloudSim, over: Partial<Params>, seconds: number) {
  const p = { ...defaultParams(sim), ...over } as Params;
  const s = sim.init(p);
  for (let t = 0; t < seconds; t += sim.maxDt) sim.step(s, p, sim.maxDt);
  return { s, p };
}

interface CuView {
  env: { h: number; zInv: number };
  bases: number[];
  topMax: number;
  wMax: number;
  thermals: { zBase: number; zTop: number; y: number[] }[];
}

/** 一定時間のあいだのサーマルの最大上昇速度と、乾いたサーマルの最高到達高度も記録する */
function runCumulus(over: Partial<Params>, seconds: number) {
  const p = { ...defaultParams(cumulusSim), ...over } as Params;
  const s = cumulusSim.init(p) as CuView;
  let wMax = 0;
  let zDryMax = 0;
  for (let t = 0; t < seconds; t += cumulusSim.maxDt) {
    cumulusSim.step(s, p, cumulusSim.maxDt);
    wMax = Math.max(wMax, s.wMax);
    for (const th of s.thermals) if (th.zBase < 0) zDryMax = Math.max(zDryMax, th.y[0]);
  }
  let top = s.topMax;
  for (const th of s.thermals) if (th.zBase >= 0) top = Math.max(top, th.zTop);
  return { s, p, wMax, zDryMax, top };
}

describe("積雲（サーマルと晴天積雲）", () => {
  it("雲底は持ち上げ凝結高度 125(T−Td) にそろう", () => {
    for (const ts of [24, 28, 32]) {
      const { s } = runCumulus({ ts }, 2400);
      expect(s.bases.length, `ts=${ts}`).toBeGreaterThan(5);
      const lcl = lclHeight(T0 + ts, CU_TD);
      for (const b of s.bases) expect(Math.abs(b - lcl) / lcl, `ts=${ts}`).toBeLessThan(0.1);
      // 雲底は平ら（サーマルごとのばらつきが小さい）
      expect(Math.max(...s.bases) - Math.min(...s.bases)).toBeLessThan(150);
    }
  });

  it("雲頂は逆転層付近で止まり、逆転層を上げると雲頂も上がる", () => {
    for (const zinv of [2.2, 2.6, 3.2]) {
      const { top } = runCumulus({ zinv }, 2400);
      const zInv = zinv * 1000;
      expect(top, `zinv=${zinv}`).toBeGreaterThan(zInv - 400);
      expect(top, `zinv=${zinv}`).toBeLessThan(zInv + 300 + 400);
    }
  });

  it("加熱が弱いと混合層が LCL に届かず、サーマルは雲を作らない", () => {
    const weak = runCumulus({ ts: 20 }, 2400);
    const lcl = lclHeight(T0 + 20, CU_TD);
    expect(weak.s.env.h).toBeLessThan(lcl);
    expect(weak.s.bases.length).toBe(0);
    expect(weak.zDryMax).toBeGreaterThan(100); // サーマル自体は上がっている
    expect(weak.zDryMax).toBeLessThan(lcl);
    const strong = runCumulus({ ts: 28 }, 2400);
    expect(strong.s.bases.length).toBeGreaterThan(5);
  });

  it("エントレインメントが強いほど上昇流は弱く、雲は低い", () => {
    const a = runCumulus({ eps: 0, inv: 0 }, 2400);
    const b = runCumulus({ eps: 1, inv: 0 }, 2400);
    const c = runCumulus({ eps: 2.5, inv: 0 }, 2400);
    expect(a.wMax).toBeGreaterThan(b.wMax);
    expect(b.wMax).toBeGreaterThan(c.wMax);
    expect(a.top).toBeGreaterThan(b.top);
    expect(b.top).toBeGreaterThanOrEqual(c.top);
  });
});

interface CbView {
  env: { h: number; zFreeze: number; snd: Parameters<typeof envAt>[0] };
  profile: ParcelProfile;
  first: { zMax: number; wMax: number; detrainZ: number };
  topSeen: number;
  wMaxSeen: number;
  particles: { z: number; ice: number; D: number }[];
  remnants: { anvil: number; z0: number }[];
}

describe("積乱雲（CAPE・オーバーシュート・かなとこ・降水）", () => {
  it("エントレインメント 0 では最大上昇速度が √(2 CAPE) に一致する", () => {
    for (const over of [{}, { lapse: 5.5 }, { td: 18, ts: 30 }]) {
      const { s } = run(cumulonimbusSim, { ...over, eps: 0 }, 1500);
      const v = s as CbView;
      expect(v.profile.cape).toBeGreaterThan(500);
      expect(v.profile.cin).toBeLessThan(1);
      const wTheory = Math.sqrt(2 * v.profile.cape + CB_W0 * CB_W0);
      expect(Math.abs(v.first.wMax - wTheory) / wTheory).toBeLessThan(0.01);
      const wPlain = Math.sqrt(2 * v.profile.cape);
      expect(Math.abs(v.first.wMax - wPlain) / wPlain).toBeLessThan(0.02);
    }
  });

  it("雲頂は平衡高度（LNB）を w/N ほど越えてから戻り、LNB 付近で横に流れ出す", () => {
    const { s } = run(cumulonimbusSim, { eps: 0 }, 1500);
    const v = s as CbView;
    const zEL = v.profile.zEL;
    expect(zEL).toBeGreaterThan(CB_Z_TROP - 1500);
    const over = v.first.zMax - zEL;
    expect(over).toBeGreaterThan(500);
    // 成層圏（等温）の浮力振動数 N^2 = (g/T)(dT/dz + g/c_p)
    const Tst = envAt(v.env.snd, 14000).T;
    const N = Math.sqrt((G / Tst) * (G / CP));
    const wEL = Math.sqrt(2 * v.profile.cape + CB_W0 * CB_W0);
    expect(Math.abs(over - wEL / N) / (wEL / N)).toBeLessThan(0.3);
    // 戻ってきて、LNB の近くで流れ出す
    expect(v.first.detrainZ).toBeGreaterThan(0);
    expect(v.first.detrainZ).toBeLessThan(v.first.zMax - 1000);
    expect(Math.abs(v.first.detrainZ - zEL)).toBeLessThan(600);
  });

  it("初期値では圏界面近くまで発達し、かなとこと降水（霰・雨）ができる", () => {
    const { s } = run(cumulonimbusSim, {}, 2400);
    const v = s as CbView;
    expect(v.profile.cape).toBeGreaterThan(1000);
    expect(v.profile.cape).toBeLessThan(4000);
    // 取り込みのため上昇流は √(2CAPE) の半分程度以下
    expect(v.wMaxSeen).toBeLessThan(0.7 * Math.sqrt(2 * v.profile.cape));
    expect(v.wMaxSeen).toBeGreaterThan(10);
    expect(Math.abs(v.topSeen - v.profile.zEL)).toBeLessThan(1500);
    const anvils = v.remnants.filter((r) => r.anvil === 1);
    expect(anvils.length).toBeGreaterThan(4);
    for (const a of anvils) expect(a.z0).toBeGreaterThan(v.env.zFreeze + 2000);
    expect(v.particles.length).toBeGreaterThan(50);
    expect(v.particles.some((q) => q.ice === 1 && q.z > v.env.zFreeze)).toBe(true);
    expect(v.particles.some((q) => q.ice === 0 && q.z < v.env.zFreeze)).toBe(true);
    // 0 ℃ より下にある小さな氷はない（融けて雨になる）
    for (const q of v.particles)
      if (q.ice === 1 && q.z < v.env.zFreeze - 300) expect(q.D).toBeGreaterThanOrEqual(0.01);
  });

  it("CAPE がほぼ 0 の乾いた安定な大気では雲が発達しない", () => {
    const over = { ts: 24, td: 8, lapse: 4.5 };
    const p = { ...defaultParams(cumulonimbusSim), ...over } as Params;
    const env = cumulonimbusEnv(p);
    const { s } = run(cumulonimbusSim, over, 2400);
    const v = s as CbView;
    expect(v.profile.cape).toBeLessThan(5);
    expect(v.topSeen).toBeLessThan(env.h + 1000);
    expect(v.remnants.filter((r) => r.anvil === 1).length).toBe(0);
    expect(v.particles.length).toBe(0);
  });

  it("雹の終端速度は √D に比例し、直径 2 cm で約 24 m/s", () => {
    const v2 = terminalVelocity(0.02, 900, 0.7);
    expect(v2).toBeGreaterThan(22);
    expect(v2).toBeLessThan(26);
    expect(terminalVelocity(0.08, 900, 0.7) / v2).toBeCloseTo(2, 5);
  });
});
