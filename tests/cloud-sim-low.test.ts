import { describe, expect, it } from "vitest";
import { defaultParams } from "@/lib/cloud-sim";
import type { Params } from "@/lib/cloud-sim";
import { lowSims } from "@/lib/cloud-sim/scenarios/low";
import {
  SC_CHU,
  scCloudBase,
  scDiagnose,
  scTendency,
  stratocumulusSim,
} from "@/lib/cloud-sim/scenarios/low-stratocumulus";
import type { ScState } from "@/lib/cloud-sim/scenarios/low-stratocumulus";
import {
  ST_N,
  extinction,
  fogLayer,
  stClock,
  stratusSim,
  visibility,
} from "@/lib/cloud-sim/scenarios/low-stratus";
import type { StState } from "@/lib/cloud-sim/scenarios/low-stratus";
import { P0, RD, CP, dewpoint, pressureAt, qsat } from "@/lib/cloud-sim/thermo";

const DAY = 86400;

function runSc(over: Partial<Params>, days: number): { s: ScState; p: Params } {
  const p = { ...defaultParams(stratocumulusSim), ...over } as Params;
  const s = stratocumulusSim.init(p) as ScState;
  const n = Math.round((days * DAY) / 600);
  for (let i = 0; i < n; i++) stratocumulusSim.step(s, p, 600);
  return { s, p };
}

function runSt(over: Partial<Params>, untilHours: number, each?: (s: StState) => void) {
  const p = { ...defaultParams(stratusSim), ...over } as Params;
  const s = stratusSim.init(p) as StState;
  while (s.t < untilHours * 3600 - 1e-6) {
    stratusSim.step(s, p, 30);
    each?.(s);
  }
  return { s, p };
}

describe("下層雲のシミュレーション", () => {
  it("層積雲と層雲が登録されている", () => {
    expect(lowSims.map((s) => s.id)).toEqual(["stratocumulus", "stratus"]);
  });
});

describe("層積雲（混合層モデル）", () => {
  it("初期値では数日で雲のある平衡に近づき、平衡では w_e = D z_i", () => {
    const { s, p } = runSc({}, 20);
    const D = p.div * 1e-6;
    expect(Math.abs(s.diag.we - D * s.zi) / s.diag.we).toBeLessThan(0.01);
    const [dzi, dthl, dqt] = scTendency([s.zi, s.thl, s.qt], p);
    expect(Math.abs(dzi)).toBeLessThan(1e-5); // 1 m/day 未満
    expect(Math.abs(dthl) * DAY).toBeLessThan(0.05);
    expect(Math.abs(dqt) * DAY).toBeLessThan(5e-5);
    // 雲がある：雲頂 0.6〜1.5 km、雲底がその下
    expect(s.zi).toBeGreaterThan(600);
    expect(s.zi).toBeLessThan(1500);
    expect(s.diag.zb).toBeLessThan(s.zi - 100);
    expect(s.diag.lwp).toBeGreaterThan(0.03);
  });

  it("平衡では熱の収支も閉じる（海面の顕熱 + エントレインメント = 雲頂の放射冷却）", () => {
    const { s, p } = runSc({}, 20);
    const sst = p.sst + 273.15;
    const surface = SC_CHU * (sst - s.thl);
    const ent = s.diag.we * s.diag.dTheta;
    expect(surface + ent).toBeCloseTo(s.diag.dF / (1.15 * CP), 4);
  });

  it("沈降（発散 D）が強いほど境界層が浅くなる", () => {
    const zi = [1, 3, 5, 8].map((div) => runSc({ div }, 20).s.zi);
    for (let i = 1; i < zi.length; i++) expect(zi[i]).toBeLessThan(zi[i - 1]);
  });

  it("逆転層の上が乾いているほど雲底が高く、雲が薄い", () => {
    const wet = runSc({ qft: 6 }, 10).s;
    const dry = runSc({ qft: 1 }, 10).s;
    expect(dry.diag.zb).toBeGreaterThan(wet.diag.zb + 100);
    expect(dry.diag.lwp).toBeLessThan(wet.diag.lwp);
  });

  it("雲底は混合層の持ち上げ凝結高度（そこで q_s = q_t）", () => {
    const thl = 287;
    const qt = 7.5e-3;
    const zb = scCloudBase(thl, qt);
    const p = pressureAt(zb, 288.15, 0.0065, P0);
    const T = thl * Math.pow(p / P0, RD / CP);
    expect(qsat(T, p) / qt).toBeCloseTo(1, 3);
    // 雲底より上では液水がある
    const d = scDiagnose(zb + 300, thl, qt, 70);
    expect(d.lwp).toBeGreaterThan(0);
    expect(scDiagnose(zb - 50, thl, qt, 70).lwp).toBe(0);
  });
});

describe("層雲（放射霧）", () => {
  it("地表付近の気温が露点に達してから液水が出る", () => {
    let before = Infinity;
    const { s } = runSt({}, 12, (st) => {
      if (st.firstLiquid < 0) {
        let dep = Infinity;
        for (let k = 0; k < ST_N; k++) {
          const p = pressureAt((k + 0.5) * 5);
          dep = Math.min(dep, st.T[k] - dewpoint(st.qv[k], p));
        }
        before = Math.min(before, dep);
      }
    });
    // 液水が出る前は、どの層も気温 > 露点
    expect(before).toBeGreaterThan(0);
    expect(s.firstLiquid).toBeGreaterThan(0);
    // 夕方は地上の気温と露点に差がある
    const s0 = stratusSim.init(defaultParams(stratusSim)) as StState;
    expect(s0.T[0] - dewpoint(s0.qv[0], pressureAt(2.5))).toBeGreaterThan(1.5);
    expect(s0.ql.every((q) => q === 0)).toBe(true);
  });

  it("初期値では夜のうちに地面に接した霧ができ、上へ厚くなり、昼には消える", () => {
    let maxTop = 0;
    let fogged = false;
    let minV = Infinity;
    const { s, p } = runSt({}, 12, (st) => {
      const f = fogLayer(st, 6);
      if (f && f.base === 0) {
        fogged = true;
        maxTop = Math.max(maxTop, f.top);
      }
      const rho0 = pressureAt(2.5) / (RD * st.T[0]);
      minV = Math.min(minV, visibility(rho0 * st.ql[0], 6e-6));
    });
    expect(fogged).toBe(true);
    expect(maxTop).toBeGreaterThanOrEqual(80);
    expect(minV).toBeLessThan(200);
    // 6時（日の出）前に地面が冷えて地上気温は夕方より下がっている
    expect(stClock(s.t)).toBeCloseTo(6, 5);
    const { s: noon } = runSt(p, 18);
    expect(fogLayer(noon, p.r)).toBeNull();
    expect(noon.Ts).toBeGreaterThan(s.Ts);
  });

  it("夕方の湿度が低いと霧はできない", () => {
    const { s } = runSt({ rh: 65 }, 18);
    expect(s.firstLiquid).toBe(-1);
  });

  it("視程はコシュミーダーの式 V = 3.912/β、β = 3W/(2ρ_w r) のとおり", () => {
    // 本文の例：N = 100 cm^-3, r = 5 µm → W ≈ 0.05 g/m^3, β ≈ 1.6e-2 /m, V ≈ 250 m
    const r = 5e-6;
    const W = (4 / 3) * Math.PI * r ** 3 * 1000 * 100e6;
    expect(extinction(W, r)).toBeCloseTo(2 * Math.PI * 100e6 * r * r, 8);
    expect(extinction(W, r)).toBeCloseTo(1.57e-2, 3);
    expect(visibility(W, r)).toBeCloseTo(3.912 / extinction(W, r), 6);
    expect(visibility(W, r)).toBeGreaterThan(240);
    expect(visibility(W, r)).toBeLessThan(260);
    expect(visibility(0, r)).toBe(Infinity);
    // 同じ水の量なら粒が小さいほど見通しが悪い
    expect(visibility(W, 2e-6)).toBeLessThan(visibility(W, 10e-6));
  });
});
