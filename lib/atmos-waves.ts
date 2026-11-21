// 大気中の波（慣性振動・慣性重力波・山岳波）の計算。
// 描画は components/AtmosphericWaves.tsx、ここは純粋な数値計算だけを置く。

export const EARTH_OMEGA = 7.2921e-5; // 地球の自転角速度 [rad/s]
export const G = 9.81;

/** コリオリパラメータ f = 2Ω sinφ [1/s] */
export function coriolisParameter(latitudeDeg: number): number {
  return 2 * EARTH_OMEGA * Math.sin((latitudeDeg * Math.PI) / 180);
}

/**
 * 気圧傾度力のない f 平面上で、初速 (u0, v0) [m/s] で放たれた空気塊の t 秒後の位置 [m]。
 * du/dt = f v, dv/dt = -f u の厳密解。北半球（f > 0）では時計回りの円を描く。
 */
export function inertialPosition(
  u0: number,
  v0: number,
  f: number,
  t: number
): { x: number; y: number; u: number; v: number } {
  if (Math.abs(f) < 1e-12) return { x: u0 * t, y: v0 * t, u: u0, v: v0 };
  const s = Math.sin(f * t);
  const c = Math.cos(f * t);
  return {
    x: (u0 * s - v0 * c + v0) / f,
    y: (u0 * c + v0 * s - u0) / f,
    u: u0 * c + v0 * s,
    v: -u0 * s + v0 * c,
  };
}

/** 浮力振動数 N = sqrt(g/θ · dθ/dz) [1/s] */
export function bruntVaisala(thetaK: number, dThetaDzKPerKm: number): number {
  const n2 = (G / thetaK) * (dThetaDzKPerKm / 1000);
  return n2 > 0 ? Math.sqrt(n2) : 0;
}

/**
 * 慣性重力波の振動数。alpha は波数ベクトルが水平から何度傾いているか [rad]。
 * ω² = N² cos²α + f² sin²α（水平に近い波数ほど N、鉛直に近いほど f に近づく）
 */
export function inertiaGravityFrequency(N: number, f: number, alpha: number): number {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return Math.sqrt(N * N * c * c + f * f * s * s);
}

/** 慣性重力波の群速度 (∂ω/∂k, ∂ω/∂m)。位相速度（波数ベクトルの向き）と直交する。 */
export function inertiaGravityGroupVelocity(
  N: number,
  f: number,
  k: number,
  m: number
): { cgx: number; cgz: number } {
  const K2 = k * k + m * m;
  const omega = Math.sqrt((N * N * k * k + f * f * m * m) / K2);
  const d = (N * N - f * f) / (omega * K2 * K2);
  return { cgx: k * m * m * d, cgz: -m * k * k * d };
}

// ---- 複素数（山岳波のフーリエ解で使う） ----
interface C {
  re: number;
  im: number;
}
const cx = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => cx(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => cx(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
/** e^{i z} */
const expi = (z: C): C => {
  const r = Math.exp(-z.im);
  return cx(r * Math.cos(z.re), r * Math.sin(z.re));
};
/** 主値の平方根（虚部が正の入力に対して実部・虚部とも非負） */
const csqrt = (z: C): C => {
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt(Math.max(0, (r + z.re) / 2));
  const im = Math.sqrt(Math.max(0, (r - z.re) / 2));
  return cx(re, z.im < 0 ? -im : im);
};

export interface MountainWaveParams {
  /** 一般風 [m/s]（山を左から右へ越える） */
  U: number;
  /** 下層（0〜H）の浮力振動数 [1/s] */
  N1: number;
  /** 上層（H より上）の浮力振動数 [1/s] */
  N2: number;
  /** 下層の厚さ [m] */
  H: number;
  /** 山の高さ [m] */
  h0: number;
  /** 山の半値幅 [m]（Witch of Agnesi 形 h = h0 a² / (x² + a²)） */
  a: number;
}

export interface WaveField {
  xs: Float64Array;
  zs: Float64Array;
  /** 鉛直変位 η [m]。eta[iz * xs.length + ix] */
  eta: Float64Array;
}

/** Scorer パラメータ l = N/U [1/m] */
export function scorer(N: number, U: number): number {
  return N / U;
}

/**
 * 2層大気の線形・非静力学の定常山岳波（流線の鉛直変位 η）をフーリエ合成で求める。
 *
 * 各層で η̂'' + (l² − k²) η̂ = 0。下層は上向き・下向きの2つの波、上層は上向き放射
 * （または上で減衰）だけを持つ。境界 z = H で η̂ と η̂' を連続にすると、下層の解は
 *   η̂(k, z) = ĥ(k) · [e^{i m₁ z} + ρ e^{i m₁ (2H − z)}] / (1 + ρ e^{2 i m₁ H}),  ρ = (m₁ − m₂)/(m₁ + m₂)
 * になる。分母が 0 に近い k が捕捉風下波（風下に長く続く波）の波長を決める。
 * l² に小さな虚部（damping）を足して、共鳴を有限の高さに抑え、風下でゆっくり減衰させる。
 */
export function computeMountainWaves(
  p: MountainWaveParams,
  xs: Float64Array,
  zs: Float64Array,
  opts: { nk?: number; damping?: number } = {}
): WaveField {
  const nk = opts.nk ?? 1200;
  const damping = opts.damping ?? 0.015;
  const l1 = scorer(p.N1, p.U);
  const l2 = scorer(p.N2, p.U);
  const kmax = Math.max(12 / p.a, 2.5 * Math.max(l1, l2));
  const dk = kmax / nk;
  const nx = xs.length;
  const nz = zs.length;

  // cos(kx), sin(kx) を先に用意しておく
  const cosKX = new Float64Array(nk * nx);
  const sinKX = new Float64Array(nk * nx);
  const ks = new Float64Array(nk);
  for (let j = 0; j < nk; j++) {
    const k = (j + 0.5) * dk;
    ks[j] = k;
    for (let ix = 0; ix < nx; ix++) {
      cosKX[j * nx + ix] = Math.cos(k * xs[ix]);
      sinKX[j * nx + ix] = Math.sin(k * xs[ix]);
    }
  }

  // 各 k, z の複素振幅（ĥ(k) dk を含む）
  const ampRe = new Float64Array(nk * nz);
  const ampIm = new Float64Array(nk * nz);
  const delta1 = damping * l1 * l1;
  const delta2 = damping * Math.max(l2 * l2, 1e-14);
  for (let j = 0; j < nk; j++) {
    const k = ks[j];
    const hk = p.h0 * p.a * Math.exp(-k * p.a) * dk;
    const m1 = csqrt(cx(l1 * l1 - k * k, delta1));
    const m2 = csqrt(cx(l2 * l2 - k * k, delta2));
    const rho = div(sub(m1, m2), add(m1, m2));
    const denom = add(cx(1), mul(rho, expi(mul(cx(2 * p.H), m1))));
    const P = div(cx(hk), denom);
    const atH = mul(P, mul(expi(mul(cx(p.H), m1)), add(cx(1), rho)));
    for (let iz = 0; iz < nz; iz++) {
      const z = zs[iz];
      let v: C;
      if (z <= p.H) {
        v = mul(P, add(expi(mul(cx(z), m1)), mul(rho, expi(mul(cx(2 * p.H - z), m1)))));
      } else {
        v = mul(atH, expi(mul(cx(z - p.H), m2)));
      }
      ampRe[j * nz + iz] = v.re;
      ampIm[j * nz + iz] = v.im;
    }
  }

  // η(x, z) = Σ_k Re[A(k, z) e^{ikx}]
  const eta = new Float64Array(nz * nx);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let s = 0;
      for (let j = 0; j < nk; j++) {
        const q = j * nx + ix;
        const a = j * nz + iz;
        s += ampRe[a] * cosKX[q] - ampIm[a] * sinKX[q];
      }
      eta[iz * nx + ix] = s;
    }
  }
  return { xs, zs, eta };
}

/**
 * 捕捉風下波の条件（Scorer 1949）: l₁² − l₂² > π² / (4H²)
 * 満たすとき、下層に閉じ込められた波が風下に何波も並ぶ。返り値はその波長 [m]（無ければ null）。
 */
export function trappedLeeWavelength(p: MountainWaveParams): number | null {
  const l1 = scorer(p.N1, p.U);
  const l2 = scorer(p.N2, p.U);
  if (l1 * l1 - l2 * l2 <= (Math.PI * Math.PI) / (4 * p.H * p.H)) return null;
  // l₂ < k < l₁ で、下層では鉛直に振動・上層では減衰するモードの分散関係
  //   tan(m₁ H) = m₁ / γ₂,  m₁ = sqrt(l₁² − k²), γ₂ = sqrt(k² − l₂²)
  // の第1モード（いちばん大きい k）を二分法で探す。下層の η が sin(m₁z)、上層が e^{−γ₂(z−H)} で、
  // z = H で η'/η が一致する条件を整理すると F(k) = γ₂ sin(m₁H) + m₁ cos(m₁H) = 0。
  // k = l₁ では m₁ = 0 で自明に 0 になるので、少し内側から探す。
  const F = (k: number) => {
    const m1 = Math.sqrt(Math.max(0, l1 * l1 - k * k));
    const g2 = Math.sqrt(Math.max(0, k * k - l2 * l2));
    return g2 * Math.sin(m1 * p.H) + m1 * Math.cos(m1 * p.H);
  };
  const steps = 2000;
  let prevK = l1 * (1 - 1e-6);
  let prevF = F(prevK);
  for (let i = 1; i <= steps; i++) {
    const k = l1 - ((l1 - l2) * i) / steps;
    const fk = F(k);
    if (prevF === 0 || Math.sign(fk) !== Math.sign(prevF)) {
      let lo = k;
      let hi = prevK;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(F(mid)) === Math.sign(F(lo))) lo = mid;
        else hi = mid;
      }
      return (2 * Math.PI) / ((lo + hi) / 2);
    }
    prevK = k;
    prevF = fk;
  }
  return null;
}

/** 露点差 [K] の空気が飽和するまでに必要な持ち上げ高さ [m]（約 125 m/K） */
export function liftToSaturate(dewpointDepressionK: number): number {
  return 125 * dewpointDepressionK;
}
