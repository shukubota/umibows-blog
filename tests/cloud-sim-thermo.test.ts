import { describe, expect, it } from "vitest";
import {
  GAMMA_D,
  T0,
  dewpoint,
  esatIce,
  esatWater,
  moistLapseRate,
  qsat,
  rk4,
  saturationAdjust,
} from "@/lib/cloud-sim/thermo";

describe("雲シミュレーションの熱力学", () => {
  it("飽和水蒸気圧は 0 ℃ で約 611 Pa、20 ℃ で約 2.34 kPa、氷面のほうが小さい", () => {
    expect(esatWater(T0)).toBeCloseTo(611.2, 0);
    expect(esatWater(T0 + 20)).toBeGreaterThan(2300);
    expect(esatWater(T0 + 20)).toBeLessThan(2360);
    expect(esatIce(T0 - 20)).toBeLessThan(esatWater(T0 - 20));
  });

  it("露点は混合比から求めた温度で飽和になる", () => {
    const p = 9e4;
    const T = T0 + 12;
    expect(dewpoint(qsat(T, p), p)).toBeCloseTo(T, 3);
  });

  it("湿潤断熱減率は乾燥断熱減率より小さく、暖かいほど小さい", () => {
    const warm = moistLapseRate(T0 + 25, 1e5);
    const cold = moistLapseRate(T0 - 30, 5e4);
    expect(warm).toBeLessThan(GAMMA_D);
    expect(warm).toBeLessThan(cold);
    expect(warm * 1000).toBeGreaterThan(3);
    expect(warm * 1000).toBeLessThan(4.5);
  });

  it("飽和調節は全水量を保ち、過飽和をなくす", () => {
    const p = 8e4;
    const r = saturationAdjust(T0 + 5, 0.012, 0, p);
    expect(r.qv + r.ql).toBeCloseTo(0.012, 10);
    expect(r.ql).toBeGreaterThan(0);
    expect(r.qv).toBeCloseTo(qsat(r.T, p), 8);
    expect(r.T).toBeGreaterThan(T0 + 5); // 凝結の潜熱で暖まる
    const back = saturationAdjust(r.T + 15, r.qv, r.ql, p); // 十分暖めれば液水はすべて蒸発する
    expect(back.ql).toBe(0);
  });

  it("RK4 は dy/dt = -y を4次の精度で解く", () => {
    let y = [1];
    const dt = 0.1;
    for (let i = 0; i < 10; i++) y = rk4((_t, v) => [-v[0]], i * dt, y, dt);
    expect(Math.abs(y[0] - Math.exp(-1))).toBeLessThan(1e-6);
  });
});
