// 対流雲（積雲・積乱雲）で共有する「エントレインメント付き空気塊（サーマル／プルーム）モデル」。
//
// 空気塊の状態は y = [z, w, s_l, q_t]（高さ・鉛直速度・液水静的エネルギー・総水量）。
//   dz/dt   = w
//   dw/dt   = B − ε |w| w
//   ds_l/dt = −ε |w| (s_l − s_e)
//   dq_t/dt = −ε |w| (q_t − q_e)
// s_l = c_p T + g z − L_v q_l と q_t は断熱上昇（凝結を含む）で保存される量なので、
// 取り込みがなければ一定。T, q_v, q_l は (s_l, q_t, p) から飽和調節で決める。
// 雲水が qlMax を超えた分は降水として空気塊から取り除く（偽断熱的）。
import {
  CP,
  G,
  LV,
  RD,
  clamp,
  qsat,
  rk4,
  saturationAdjust,
  virtualTemperature,
  type Vec,
} from "../thermo";

/** 環境の鉛直分布（等間隔の表） */
export interface Sounding {
  dz: number;
  n: number;
  T: Float64Array;
  qv: Float64Array;
  p: Float64Array;
  Tv: Float64Array;
  /** 乾燥静的エネルギー c_p T + g z */
  s: Float64Array;
}

/**
 * 気温 tempAt(z) と水蒸気 qvAt(z, T, p) から、静水圧の式で気圧を積み上げて表を作る。
 */
export function buildSounding(
  top: number,
  dz: number,
  ps: number,
  tempAt: (z: number) => number,
  qvAt: (z: number, T: number, p: number) => number
): Sounding {
  const n = Math.floor(top / dz) + 1;
  const T = new Float64Array(n);
  const qv = new Float64Array(n);
  const p = new Float64Array(n);
  const Tv = new Float64Array(n);
  const s = new Float64Array(n);
  p[0] = ps;
  for (let i = 0; i < n; i++) {
    const z = i * dz;
    T[i] = tempAt(z);
    qv[i] = Math.max(0, qvAt(z, T[i], p[i]));
    Tv[i] = virtualTemperature(T[i], qv[i]);
    s[i] = CP * T[i] + G * z;
    if (i + 1 < n) {
      const TvNext = virtualTemperature(tempAt(z + dz), qv[i]);
      p[i + 1] = p[i] * Math.exp((-G * dz) / (RD * 0.5 * (Tv[i] + TvNext)));
    }
  }
  return { dz, n, T, qv, p, Tv, s };
}

export interface EnvPoint {
  T: number;
  qv: number;
  p: number;
  Tv: number;
  s: number;
}

/** 高さ z の環境の値（線形補間、表の外は端の値） */
export function envAt(snd: Sounding, z: number): EnvPoint {
  const x = clamp(z / snd.dz, 0, snd.n - 1.000001);
  const i = Math.floor(x);
  const f = x - i;
  const L = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * f;
  // s は表の外では g z の分だけずらす（c_p T 部分は端の値）
  const zc = clamp(z, 0, (snd.n - 1) * snd.dz);
  return { T: L(snd.T), qv: L(snd.qv), p: L(snd.p), Tv: L(snd.Tv), s: L(snd.s) + G * (z - zc) };
}

export interface ParcelThermo {
  T: number;
  qv: number;
  ql: number;
  Tv: number;
  /** 浮力 [m/s^2]（雲水の荷重を含む） */
  B: number;
  env: EnvPoint;
}

/** (z, s_l, q_t) から空気塊の気温・水蒸気・雲水と浮力を出す */
export function parcelThermo(snd: Sounding, z: number, sl: number, qt: number): ParcelThermo {
  const env = envAt(snd, z);
  const Tl = (sl - G * z) / CP;
  const a = saturationAdjust(Tl, Math.max(qt, 0), 0, env.p);
  const Tv = virtualTemperature(a.T, a.qv, a.ql);
  return { T: a.T, qv: a.qv, ql: a.ql, Tv, B: (G * (Tv - env.Tv)) / env.Tv, env };
}

/** 気温 T・混合比 q の空気塊を高さ z, 速度 w0 で作る（未飽和を仮定） */
export function makeParcel(z: number, w0: number, T: number, q: number): Vec {
  return [z, w0, CP * T + G * z, q];
}

export function parcelDeriv(snd: Sounding, eps: number) {
  return (_t: number, y: Vec): Vec => {
    const [z, w, sl, qt] = y;
    const th = parcelThermo(snd, z, sl, qt);
    const mix = eps * Math.abs(w);
    return [w, th.B - mix * w, -mix * (sl - th.env.s), -mix * (qt - th.env.qv)];
  };
}

/**
 * RK4 で dt 進め、雲水が qlMax を超えた分を降水として取り除く。
 * 返り値は取り除いた水の混合比 [kg/kg]。
 */
export function stepParcel(
  snd: Sounding,
  y: Vec,
  dt: number,
  eps: number,
  qlMax: number
): { y: Vec; rain: number; th: ParcelThermo } {
  const ny = rk4(parcelDeriv(snd, eps), 0, y, dt);
  let th = parcelThermo(snd, ny[0], ny[2], ny[3]);
  let rain = 0;
  if (th.ql > qlMax) {
    rain = th.ql - qlMax;
    ny[3] -= rain;
    ny[2] += LV * rain; // T を変えずに液水だけを抜く
    th = parcelThermo(snd, ny[0], ny[2], ny[3]);
  }
  return { y: ny, rain, th };
}

/** 空気塊を高さ方向に持ち上げたときの分布と、CAPE・CIN・LCL・LFC・平衡高度 */
export interface ParcelProfile {
  z: number[];
  Tp: number[];
  Te: number[];
  B: number[];
  /** 見つからなければ −1 */
  zLCL: number;
  zLFC: number;
  zEL: number;
  cape: number;
  cin: number;
}

/**
 * 時間積分と同じ式を高さで解く: dφ/dz = −ε(φ − φ_e) を1段ごとに厳密解 e^{−ε dz} で進め、
 * 同じ飽和調節・同じ降水の取り除き方で浮力 B(z) を出す。
 */
export function liftProfile(
  snd: Sounding,
  z0: number,
  T0: number,
  q0: number,
  eps: number,
  qlMax: number,
  zTop: number,
  dz = 20
): ParcelProfile {
  const zs: number[] = [];
  const Tp: number[] = [];
  const Te: number[] = [];
  const Bs: number[] = [];
  let sl = CP * T0 + G * z0;
  let qt = q0;
  let zLCL = -1;
  const decay = Math.exp(-eps * dz);
  for (let z = z0; z <= zTop + 1e-9; z += dz) {
    if (z > z0) {
      const e = envAt(snd, z);
      sl = e.s + (sl - e.s) * decay;
      qt = e.qv + (qt - e.qv) * decay;
    }
    let th = parcelThermo(snd, z, sl, qt);
    if (th.ql > qlMax) {
      const r = th.ql - qlMax;
      qt -= r;
      sl += LV * r;
      th = parcelThermo(snd, z, sl, qt);
    }
    if (zLCL < 0 && th.ql > 0) zLCL = z;
    zs.push(z);
    Tp.push(th.T);
    Te.push(th.env.T);
    Bs.push(th.B);
  }
  // LFC: 飽和していて浮力が正になる最初の高さ。EL: それより上で浮力が正の最も高い所の上端
  let iLFC = -1;
  for (let i = 0; i < zs.length; i++) {
    if (zLCL >= 0 && zs[i] >= zLCL && Bs[i] > 0) {
      iLFC = i;
      break;
    }
  }
  let zLFC = -1;
  let zEL = -1;
  let cape = 0;
  let cin = 0;
  if (iLFC >= 0) {
    let iEL = iLFC;
    for (let i = zs.length - 1; i > iLFC; i--) {
      if (Bs[i] > 0) {
        iEL = i;
        break;
      }
    }
    const cross = (i: number) =>
      i > 0 && Bs[i - 1] !== Bs[i] && Bs[i - 1] <= 0
        ? zs[i - 1] + (dz * -Bs[i - 1]) / (Bs[i] - Bs[i - 1])
        : zs[i];
    zLFC = cross(iLFC);
    if (iEL + 1 < zs.length && Bs[iEL + 1] < 0) {
      zEL = zs[iEL] + (dz * Bs[iEL]) / (Bs[iEL] - Bs[iEL + 1]);
    } else {
      zEL = zs[iEL];
    }
    for (let i = iLFC; i < zs.length - 1; i++) {
      const za = Math.max(zs[i], zLFC);
      const zb = Math.min(zs[i + 1], zEL);
      if (zb <= za) continue;
      cape += 0.5 * (Bs[i] + Bs[i + 1]) * (zb - za);
    }
    // LFC の直下の区間（LFC までの部分）も足す
    if (iLFC > 0 && zLFC < zs[iLFC]) cape += 0.5 * Bs[iLFC] * (zs[iLFC] - zLFC);
    for (let i = 0; i < iLFC; i++) {
      const b = 0.5 * (Bs[i] + Bs[i + 1]);
      if (b < 0) cin -= b * dz;
    }
    cape = Math.max(cape, 0);
  } else {
    for (let i = 0; i < zs.length - 1; i++) {
      const b = 0.5 * (Bs[i] + Bs[i + 1]);
      if (b < 0) cin -= b * dz;
    }
  }
  return { z: zs, Tp, Te, B: Bs, zLCL, zLFC, zEL, cape, cin };
}

/** 相対湿度 rh の混合比 */
export function qvFromRH(rh: number, T: number, p: number): number {
  return rh * qsat(T, p);
}

/** 空気の密度 */
export function rhoAir(env: EnvPoint): number {
  return env.p / (RD * env.Tv);
}
