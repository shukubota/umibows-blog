// 上層雲（巻雲・巻層雲）で使う氷晶の拡散成長の係数。
// dm/dt = 4π C (S_i − 1) / (F_k + F_d)（Rogers & Yau の形）。C は「静電容量」に相当する長さ。
import { esatIce, LS, P0, RV, T0 } from "../thermo";

/** 空気の熱伝導率 [W/(m K)]（上空の代表値） */
export const K_AIR = 0.024;

/** 水蒸気の拡散係数 [m^2/s]（温度と気圧で変える） */
export function vaporDiffusivity(T: number, p: number): number {
  return 2.11e-5 * Math.pow(T / T0, 1.94) * (P0 / p);
}

/** 熱の伝わりにくさ F_k と水蒸気の拡散しにくさ F_d [m s/kg] */
export function iceGrowthResistances(T: number, p: number): { Fk: number; Fd: number } {
  const Fk = (LS / (RV * T) - 1) * (LS / (K_AIR * T));
  const Fd = (RV * T) / (vaporDiffusivity(T, p) * esatIce(T));
  return { Fk, Fd };
}

/** 1/(F_k + F_d)。これに 4πC(S_i − 1) を掛けると dm/dt [kg/s] */
export function iceGrowthCoefficient(T: number, p: number): number {
  const { Fk, Fd } = iceGrowthResistances(T, p);
  return 1 / (Fk + Fd);
}
