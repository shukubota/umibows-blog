// 雲のシミュレーションで共通に使う熱力学と数値積分。SI 単位（K, Pa, kg/kg, m, s）。

export const G = 9.81; // 重力加速度 [m/s^2]
export const CP = 1004; // 乾燥空気の定圧比熱 [J/(kg K)]
export const RD = 287.04; // 乾燥空気の気体定数
export const RV = 461.5; // 水蒸気の気体定数
export const EPS = RD / RV; // ≈ 0.622
export const LV = 2.5e6; // 蒸発の潜熱 [J/kg]
export const LS = 2.834e6; // 昇華の潜熱 [J/kg]
export const LF = LS - LV; // 融解の潜熱
export const T0 = 273.15;
export const RHO_W = 1000; // 水の密度 [kg/m^3]
export const RHO_I = 917; // 氷の密度
export const GAMMA_D = G / CP; // 乾燥断熱減率 ≈ 9.8 K/km
export const P0 = 1e5;

/** 水面に対する飽和水蒸気圧 [Pa]（Bolton 1980） */
export function esatWater(T: number): number {
  const c = T - T0;
  return 611.2 * Math.exp((17.67 * c) / (c + 243.5));
}

/** 氷面に対する飽和水蒸気圧 [Pa]（Buck 1981） */
export function esatIce(T: number): number {
  const c = T - T0;
  return 611.15 * Math.exp((22.452 * c) / (c + 272.55));
}

/** 混合比と水蒸気圧の換算 */
export function mixingRatioFromE(e: number, p: number): number {
  return (EPS * e) / Math.max(p - e, 1);
}
export function eFromMixingRatio(q: number, p: number): number {
  return (q * p) / (EPS + q);
}

/** 飽和混合比 [kg/kg]。ice=true なら氷面に対する値 */
export function qsat(T: number, p: number, ice = false): number {
  return mixingRatioFromE(ice ? esatIce(T) : esatWater(T), p);
}

/** dq_s/dT（Clausius–Clapeyron から） */
export function dqsatDT(T: number, p: number, ice = false): number {
  return (qsat(T, p, ice) * (ice ? LS : LV)) / (RV * T * T);
}

/** 混合比 q の露点 [K]（Bolton の式の逆） */
export function dewpoint(q: number, p: number): number {
  const e = Math.max(eFromMixingRatio(q, p), 1e-6);
  const x = Math.log(e / 611.2);
  return (243.5 * x) / (17.67 - x) + T0;
}

/** 持ち上げ凝結高度 [m] の近似 125 (T − Td) */
export function lclHeight(T: number, Td: number): number {
  return 125 * Math.max(T - Td, 0);
}

/** 湿潤断熱減率 [K/m] */
export function moistLapseRate(T: number, p: number): number {
  const qs = qsat(T, p);
  return (G * (1 + (LV * qs) / (RD * T))) / (CP + (LV * LV * qs * EPS) / (RD * T * T));
}

export function potentialTemperature(T: number, p: number): number {
  return T * Math.pow(P0 / p, RD / CP);
}

/** 仮温度（凝結水 ql の荷重も含む） */
export function virtualTemperature(T: number, qv: number, ql = 0): number {
  return T * (1 + 0.608 * qv - ql);
}

/** 標準大気（対流圏、温度減率 lapse [K/m]）の気圧 [Pa] */
export function pressureAt(z: number, Ts = 288.15, lapse = 0.0065, ps = 101325): number {
  return ps * Math.pow(1 - (lapse * z) / Ts, G / (RD * lapse));
}

/** 気温と気圧から空気の密度 */
export function airDensity(T: number, p: number): number {
  return p / (RD * T);
}

/**
 * 飽和調節。全水量 qt = qv + ql と液水温位に相当する量を保ったまま、
 * 過飽和なら凝結、未飽和で液水があれば蒸発させた (T, qv, ql) を返す。
 */
export function saturationAdjust(
  T: number,
  qv: number,
  ql: number,
  p: number,
  ice = false
): { T: number; qv: number; ql: number } {
  const L = ice ? LS : LV;
  const qt = qv + ql;
  const Tl = T - (L / CP) * ql; // 液水がすべて蒸発したときの温度
  if (qt <= qsat(Tl, p, ice)) return { T: Tl, qv: qt, ql: 0 };
  let Tn = T;
  for (let i = 0; i < 20; i++) {
    const f = Tn - Tl - (L / CP) * (qt - qsat(Tn, p, ice));
    const df = 1 + (L / CP) * dqsatDT(Tn, p, ice);
    const d = f / df;
    Tn -= d;
    if (Math.abs(d) < 1e-6) break;
  }
  const qs = qsat(Tn, p, ice);
  return { T: Tn, qv: qs, ql: qt - qs };
}

export type Vec = number[];

/** 古典的な4次のルンゲ＝クッタ法で1ステップ進める */
export function rk4(f: (t: number, y: Vec) => Vec, t: number, y: Vec, dt: number): Vec {
  const k1 = f(t, y);
  const k2 = f(
    t + dt / 2,
    y.map((v, i) => v + (dt / 2) * k1[i])
  );
  const k3 = f(
    t + dt / 2,
    y.map((v, i) => v + (dt / 2) * k2[i])
  );
  const k4 = f(
    t + dt,
    y.map((v, i) => v + dt * k3[i])
  );
  return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 再現できる乱数（シード付き） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
