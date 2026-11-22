// 2層準地衡流モデル（Phillips モデル）で傾圧不安定を解く。
// 描画は components/BaroclinicSim.tsx、ここは純粋な数値計算だけを置く。
//
// 東西 Lx（周期）× 南北 Ly の水路。南北の端は壁（ψ = 0）で、計算は南北に奇対称に
// 折り返した 2Ly の二重周期領域で行う（sin 級数と同じ）。上層（1）と下層（2）は同じ厚さで、
// 一様な東西風 U1 > U2（上ほど西風が強い＝南ほど暖かい）を背景に置き、その上の擾乱を解く。
//
//   q_i = ∇²ψ_i + F(ψ_j − ψ_i)                        （擾乱の渦位）
//   ∂q_i/∂t + U_i ∂q_i/∂x + J(ψ_i, q_i) + Q_iy ∂ψ_i/∂x = −r δ_i2 ∇²ψ_2
//   Q_1y = β + F(U1 − U2),  Q_2y = β − F(U1 − U2)
//
// 時間積分は Adams–Bashforth 3次、空間はフーリエ擬スペクトル法。
// 格子規模にたまる渦位の分散は指数フィルタで落とす（pyqg と同じやり方）。

export const EARTH_OMEGA = 7.2921e-5;
export const G = 9.81;
export const EARTH_RADIUS = 6.371e6;

// ===================================================================================
// FFT（基数2・複素）
// ===================================================================================

interface FftPlan {
  n: number;
  rev: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;
}

const plans = new Map<number, FftPlan>();

function getPlan(n: number): FftPlan {
  const cached = plans.get(n);
  if (cached) return cached;
  if (n < 1 || (n & (n - 1)) !== 0) throw new Error(`FFT の長さは2のべき乗: ${n}`);
  const bits = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const plan = { n, rev, cos, sin };
  plans.set(n, plan);
  return plan;
}

/** 長さ n の複素 FFT（その場で上書き）。inverse のとき 1/n は掛けない。 */
export function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  const { rev, cos, sin } = getPlan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sign * sin[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** nx × ny（行優先、index = j*nx + i）の2次元複素 FFT。inverse のとき 1/(nx·ny) を掛ける。 */
export function fft2d(
  re: Float64Array,
  im: Float64Array,
  nx: number,
  ny: number,
  inverse: boolean
): void {
  const rowRe = new Float64Array(nx);
  const rowIm = new Float64Array(nx);
  for (let j = 0; j < ny; j++) {
    const o = j * nx;
    for (let i = 0; i < nx; i++) {
      rowRe[i] = re[o + i];
      rowIm[i] = im[o + i];
    }
    fft1d(rowRe, rowIm, inverse);
    for (let i = 0; i < nx; i++) {
      re[o + i] = rowRe[i];
      im[o + i] = rowIm[i];
    }
  }
  const colRe = new Float64Array(ny);
  const colIm = new Float64Array(ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      colRe[j] = re[j * nx + i];
      colIm[j] = im[j * nx + i];
    }
    fft1d(colRe, colIm, inverse);
    for (let j = 0; j < ny; j++) {
      re[j * nx + i] = colRe[j];
      im[j * nx + i] = colIm[j];
    }
  }
  if (inverse) {
    const s = 1 / (nx * ny);
    for (let k = 0; k < re.length; k++) {
      re[k] *= s;
      im[k] *= s;
    }
  }
}

// ===================================================================================
// パラメータと線形理論
// ===================================================================================

export interface BaroclinicParams {
  /** ジェットの中心での上層と下層の西風の差 U1 − U2 [m/s]（＝南北の温度差の強さ） */
  shear: number;
  /**
   * ジェット（温度差の集中する帯）の半幅 [m]。Infinity なら水路全体で一様。
   * 東西平均の上層の風は U2 + shear·exp(−((y − Ly/2)/jetWidth)²)。
   */
  jetWidth: number;
  /** 下層の西風 U2 [m/s] */
  lowerWind: number;
  /** 浮力振動数 N [1/s]（静的安定度） */
  N: number;
  /** β = df/dy [1/(m·s)] */
  beta: number;
  /** 下層の摩擦（地表摩擦）の強さ r [1/s] */
  drag: number;
  /**
   * 帯状平均（東西に平均した流れと気温）を基準の状態に戻す強さ [1/s]。
   * 放射で温度差が保たれ、摩擦でジェットが弱められる効果をまとめたもの。
   */
  zonalRelax: number;
  /** 緯度 [度]（f0 を決める） */
  latitude: number;
}

/** 1層の厚さ [m]（対流圏 10 km を2層に分ける） */
export const LAYER_DEPTH = 5000;
/** 温度に直すときの基準温度 [K] */
export const T0 = 270;

export const DEFAULT_PARAMS: BaroclinicParams = {
  shear: 25,
  jetWidth: 1500e3,
  lowerWind: 5,
  N: 0.012,
  beta: betaAt(45),
  drag: 1 / (3 * 86400),
  zonalRelax: 1 / (4 * 86400),
  latitude: 45,
};

export function coriolisParameter(latitudeDeg: number): number {
  return 2 * EARTH_OMEGA * Math.sin((latitudeDeg * Math.PI) / 180);
}

export function betaAt(latitudeDeg: number): number {
  return (2 * EARTH_OMEGA * Math.cos((latitudeDeg * Math.PI) / 180)) / EARTH_RADIUS;
}

export interface Derived {
  f0: number;
  /** 層間の結合 F = f0² / (N² H²) [1/m²] */
  F: number;
  /** 変形半径 L_d = 1/√(2F) = NH/(√2 f0) [m] */
  Ld: number;
  /** 水路で平均した風の差（モデルの一様な背景） */
  shearMean: number;
  U1: number;
  U2: number;
  Q1y: number;
  Q2y: number;
  /** ψ1 − ψ2 [m²/s] を温度 [K] に直す係数 */
  tempPerPsi: number;
}

/** ジェットの形 G(y)（中心で 1） */
export function jetShape(y: number, Ly: number, width: number): number {
  if (!Number.isFinite(width)) return 1;
  const s = (y - Ly / 2) / width;
  return Math.exp(-s * s);
}

/** 格子点 j·Ly/ny（j = 0..ny）で台形則により平均した G */
export function meanJetShape(Ly: number, width: number, ny = 64): number {
  if (!Number.isFinite(width)) return 1;
  let sum = 0;
  for (let j = 0; j <= ny; j++) {
    const wgt = j === 0 || j === ny ? 0.5 : 1;
    sum += wgt * jetShape((j * Ly) / ny, Ly, width);
  }
  return sum / ny;
}

export function derive(p: BaroclinicParams, Ly = 8_000e3, ny = 64): Derived {
  const f0 = coriolisParameter(p.latitude);
  const F = (f0 * f0) / (p.N * p.N * LAYER_DEPTH * LAYER_DEPTH);
  const shearMean = p.shear * meanJetShape(Ly, p.jetWidth, ny);
  const U2 = p.lowerWind;
  const U1 = p.lowerWind + shearMean;
  return {
    f0,
    F,
    Ld: 1 / Math.sqrt(2 * F),
    shearMean,
    U1,
    U2,
    Q1y: p.beta + F * shearMean,
    Q2y: p.beta - F * shearMean,
    // 浮力 b = f0(ψ1−ψ2)/H（温度風の関係）、温度 T' = T0 b / g
    tempPerPsi: (T0 * f0) / (G * LAYER_DEPTH),
  };
}

/**
 * 一様な風の差 p.shear（ジェットの中心の値）を仮定したときの、
 * 波数 (k, l) [1/m] の擾乱の線形成長率 σ [1/s] と東西の位相速度 c [m/s]。
 * ψ ∝ exp(i(kx + ly − ωt)) を入れて 2×2 の固有値問題 ω ψ = k M⁻¹(diag(U)M + diag(Q_y)) ψ を解く。
 */
export function linearGrowth(
  k: number,
  l: number,
  p: BaroclinicParams
): { sigma: number; c: number } {
  const d = derive({ ...p, jetWidth: Infinity });
  const K2 = k * k + l * l;
  if (K2 === 0 || k === 0) return { sigma: 0, c: 0 };
  const { F, U1, U2, Q1y, Q2y } = d;
  const a = -K2 - F;
  const det = K2 * (K2 + 2 * F);
  // B = diag(U) M + diag(Q_y)
  const b11 = U1 * a + Q1y;
  const b12 = U1 * F;
  const b21 = U2 * F;
  const b22 = U2 * a + Q2y;
  // A = M⁻¹ B,  M⁻¹ = (1/det) [[a, −F], [−F, a]]
  const a11 = (a * b11 - F * b21) / det;
  const a12 = (a * b12 - F * b22) / det;
  const a21 = (-F * b11 + a * b21) / det;
  const a22 = (-F * b12 + a * b22) / det;
  const tr = a11 + a22;
  const dt = a11 * a22 - a12 * a21;
  const disc = (tr * tr) / 4 - dt;
  if (disc >= 0) return { sigma: 0, c: tr / 2 + Math.sqrt(disc) };
  return { sigma: Math.abs(k) * Math.sqrt(-disc), c: tr / 2 };
}

/** 東西波長 λ [m] ごとの成長率を返す（南北の波数は l）。グラフ用。 */
export function growthCurve(
  p: BaroclinicParams,
  lambdas: number[],
  l = 0
): { lambda: number; sigma: number; c: number }[] {
  return lambdas.map((lambda) => {
    const g = linearGrowth((2 * Math.PI) / lambda, l, p);
    return { lambda, ...g };
  });
}

/** 東西 Lx の周期領域に入り、南北に幅 Ly の半波長1つを持つ波のうち、いちばん速く育つもの */
export function fastestDomainMode(
  p: BaroclinicParams,
  Lx: number,
  Ly: number,
  maxWavenumber = 32
): { n: number; lambda: number; sigma: number; c: number } {
  let best = { n: 1, lambda: Lx, sigma: 0, c: 0 };
  for (let n = 1; n <= maxWavenumber; n++) {
    const g = linearGrowth((2 * Math.PI * n) / Lx, Math.PI / Ly, p);
    if (g.sigma > best.sigma) best = { n, lambda: Lx / n, ...g };
  }
  return best;
}

// ===================================================================================
// 乱数
// ===================================================================================

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===================================================================================
// モデル本体
// ===================================================================================

export interface GridOptions {
  nx?: number;
  ny?: number;
  /** 東西の長さ [m] */
  Lx?: number;
  /** 南北の長さ [m] */
  Ly?: number;
  /** 時間刻み [s] */
  dt?: number;
  /** 雲を描く細かい格子の倍率 */
  cloudScale?: number;
}

export class TwoLayerQG {
  readonly nx: number;
  /** 水路の南北の格子数（行 0 が南の壁、行 ny が北の壁） */
  readonly ny: number;
  /** 計算に使う南北の格子数（= 2ny、奇対称に折り返した分を含む） */
  readonly nyc: number;
  readonly Lx: number;
  readonly Ly: number;
  readonly dx: number;
  readonly dy: number;
  /** 現在の時間刻み [s]（風が強いと CFL 条件で小さくなる） */
  dt: number;
  /** 時間刻みの上限 [s] */
  readonly dtMax: number;
  readonly size: number;

  params: BaroclinicParams;
  d: Derived;
  /** 経過時間 [s] */
  t = 0;
  steps = 0;
  /** 雲をまだ動かしていない時間 [s]（雲は数歩ぶんまとめて動かす） */
  private cloudLag = 0;

  // 帯状平均の基準の渦位（ジェットの形）。東西波数 0 の列だけ値を持つ
  private ref: {
    q1r: Float64Array;
    q1i: Float64Array;
    q2r: Float64Array;
    q2i: Float64Array;
  } | null = null;
  // スペクトル空間の渦位（実部・虚部）
  private q1r: Float64Array;
  private q1i: Float64Array;
  private q2r: Float64Array;
  private q2i: Float64Array;
  // 波数
  private kx: Float64Array;
  private ky: Float64Array;
  private K2: Float64Array;
  private filter: Float64Array;
  // Adams–Bashforth 用の過去の傾向
  private hist: { r1r: Float64Array; r1i: Float64Array; r2r: Float64Array; r2i: Float64Array }[] =
    [];

  // 物理空間の速度（直近の傾向計算のときのもの）
  readonly u1: Float64Array;
  readonly v1: Float64Array;
  readonly u2: Float64Array;
  readonly v2: Float64Array;
  /** 中層（層の境）の鉛直流 w [m/s] */
  readonly w: Float64Array;
  /** 下層の寒気移流 −V₂·∇T [K/s]（負なら寒気が流れ込む） */
  readonly coldAdv: Float64Array;

  // 雲（細かい格子）
  readonly cnx: number;
  readonly cny: number;
  /** 上層雲（巻雲〜乱層雲の雲頂）の量 0..1 */
  highCloud: Float32Array;
  /** 下層雲（寒気の吹き出しの層積雲・積雲）の量 0..1 */
  lowCloud: Float32Array;

  // 作業用
  private wr: Float64Array;
  private wi: Float64Array;
  private xr: Float64Array;
  private xi: Float64Array;

  constructor(params: BaroclinicParams = DEFAULT_PARAMS, opts: GridOptions = {}) {
    this.nx = opts.nx ?? 128;
    this.ny = opts.ny ?? 64;
    this.Lx = opts.Lx ?? 16_000e3;
    this.Ly = opts.Ly ?? 8_000e3;
    this.dx = this.Lx / this.nx;
    this.dy = this.Ly / this.ny;
    this.nyc = 2 * this.ny;
    this.dtMax = opts.dt ?? 900;
    this.dt = this.dtMax;
    this.size = this.nx * this.nyc;
    this.params = { ...params };
    this.d = derive(this.params, this.Ly, this.ny);

    const n = this.size;
    this.q1r = new Float64Array(n);
    this.q1i = new Float64Array(n);
    this.q2r = new Float64Array(n);
    this.q2i = new Float64Array(n);
    this.u1 = new Float64Array(n);
    this.v1 = new Float64Array(n);
    this.u2 = new Float64Array(n);
    this.v2 = new Float64Array(n);
    this.w = new Float64Array(n);
    this.coldAdv = new Float64Array(n);
    this.wr = new Float64Array(n);
    this.wi = new Float64Array(n);
    this.xr = new Float64Array(n);
    this.xi = new Float64Array(n);

    this.kx = new Float64Array(n);
    this.ky = new Float64Array(n);
    this.K2 = new Float64Array(n);
    this.filter = new Float64Array(n);
    const cphi = 0.65 * Math.PI;
    for (let j = 0; j < this.nyc; j++) {
      const lj = j <= this.nyc / 2 ? j : j - this.nyc;
      for (let i = 0; i < this.nx; i++) {
        const ki = i <= this.nx / 2 ? i : i - this.nx;
        const idx = j * this.nx + i;
        const k = (2 * Math.PI * ki) / this.Lx;
        const l = (2 * Math.PI * lj) / (2 * this.Ly);
        // ナイキスト波数は実数場で符号が決まらないので微分では 0 にする
        this.kx[idx] = i === this.nx / 2 ? 0 : k;
        this.ky[idx] = j === this.nyc / 2 ? 0 : l;
        this.K2[idx] = k * k + l * l;
        const wv = Math.hypot(k * this.dx, l * this.dy);
        this.filter[idx] = wv > cphi ? Math.exp(-23.6 * Math.pow(wv - cphi, 4)) : 1;
      }
    }

    const cs = opts.cloudScale ?? 2;
    this.cnx = this.nx * cs;
    this.cny = this.ny * cs;
    this.highCloud = new Float32Array(this.cnx * this.cny);
    this.lowCloud = new Float32Array(this.cnx * this.cny);
    this.ref = this.buildReference();
  }

  setParams(p: BaroclinicParams): void {
    this.params = { ...p };
    this.d = derive(this.params, this.Ly, this.ny);
    this.ref = this.buildReference();
    // 傾向の式が変わったので Adams–Bashforth の履歴は捨てる
    this.hist = [];
  }

  /** 擾乱を消して、ランダムな小さい擾乱を置く。rmsSpeed は擾乱の風速の目安 [m/s]。 */
  seedRandom(seed = 1, rmsSpeed = 0.1): void {
    const rand = mulberry32(seed);
    const n = this.size;
    // 物理空間の白色雑音 → 東西波数 2〜12 の帯域だけ残す
    for (const [re, im] of [
      [this.q1r, this.q1i],
      [this.q2r, this.q2i],
    ] as const) {
      for (let k = 0; k < n; k++) {
        re[k] = rand() - 0.5;
        im[k] = 0;
      }
      fft2d(re, im, this.nx, this.nyc, false);
      for (let k = 0; k < n; k++) {
        const kk = Math.sqrt(this.K2[k]) * (this.Lx / (2 * Math.PI));
        if (kk < 2 || kk > 12 || k % this.nx === 0) {
          re[k] = 0;
          im[k] = 0;
        }
      }
    }
    this.makeOdd();
    this.scaleTo(rmsSpeed);
    this.addReference();
    this.resetClock();
  }

  /** 東西波数 n、南北に半波長1つの波を1つだけ置く。テストと解説用。 */
  seedMode(n: number, rmsSpeed = 1e-3): void {
    const k = (2 * Math.PI * n) / this.Lx;
    const l = Math.PI / this.Ly;
    const psi1 = new Float64Array(this.size);
    const psi2 = new Float64Array(this.size);
    for (let j = 0; j < this.nyc; j++) {
      const sy = Math.sin(l * j * this.dy);
      for (let i = 0; i < this.nx; i++) {
        // 下層だけ位相をずらしておくと、育つモードがすぐ立ち上がる
        psi1[j * this.nx + i] = Math.cos(k * i * this.dx) * sy;
        psi2[j * this.nx + i] = Math.cos(k * i * this.dx + 1) * sy;
      }
    }
    this.psiToQ(psi1, psi2, this.q1r, this.q1i, this.q2r, this.q2i);
    this.makeOdd();
    this.scaleTo(rmsSpeed);
    this.addReference();
    this.resetClock();
  }

  /** 物理空間の ψ1, ψ2（計算格子 nx × nyc）からスペクトルの q を作る */
  private psiToQ(
    psi1: Float64Array,
    psi2: Float64Array,
    q1r: Float64Array,
    q1i: Float64Array,
    q2r: Float64Array,
    q2i: Float64Array
  ): void {
    const n = this.size;
    const F = this.d.F;
    const p1r = Float64Array.from(psi1);
    const p1i = new Float64Array(n);
    const p2r = Float64Array.from(psi2);
    const p2i = new Float64Array(n);
    fft2d(p1r, p1i, this.nx, this.nyc, false);
    fft2d(p2r, p2i, this.nx, this.nyc, false);
    for (let k = 0; k < n; k++) {
      const a = -this.K2[k] - F;
      q1r[k] = a * p1r[k] + F * p2r[k];
      q1i[k] = a * p1i[k] + F * p2i[k];
      q2r[k] = F * p1r[k] + a * p2r[k];
      q2i[k] = F * p1i[k] + a * p2i[k];
    }
  }

  /**
   * 帯状平均の基準状態。上層の東西平均の風が U2 + shear·G(y) になるように、
   * 一様な背景 U1 = U2 + shearMean からのずれ u1' = shear·G − shearMean を ψ1 に入れる。
   * ∫u1' dy = 0 なので南北の壁で ψ1 = 0 を満たす。
   */
  private buildReference() {
    if (!Number.isFinite(this.params.jetWidth)) return null;
    const { nx, ny, nyc, dy, Ly } = this;
    const peak = this.params.shear;
    const mean = this.d.shearMean;
    const u = (j: number) => peak * jetShape(j * dy, Ly, this.params.jetWidth) - mean;
    const col = new Float64Array(ny + 1);
    for (let j = 1; j <= ny; j++) col[j] = col[j - 1] - 0.5 * (u(j - 1) + u(j)) * dy;
    col[ny] = 0;
    const psi1 = new Float64Array(this.size);
    const psi2 = new Float64Array(this.size);
    for (let j = 0; j < nyc; j++) {
      const v = j <= ny ? col[j] : -col[nyc - j];
      for (let i = 0; i < nx; i++) psi1[j * nx + i] = v;
    }
    const r = {
      q1r: new Float64Array(this.size),
      q1i: new Float64Array(this.size),
      q2r: new Float64Array(this.size),
      q2i: new Float64Array(this.size),
    };
    this.psiToQ(psi1, psi2, r.q1r, r.q1i, r.q2r, r.q2i);
    // 東西波数 0 以外の丸め誤差は捨てる
    for (const a of [r.q1r, r.q1i, r.q2r, r.q2i])
      for (let k = 0; k < a.length; k++) if (k % nx !== 0) a[k] = 0;
    return r;
  }

  private addReference(): void {
    const r = this.ref;
    if (!r) return;
    for (let k = 0; k < this.size; k++) {
      this.q1r[k] += r.q1r[k];
      this.q1i[k] += r.q1i[k];
      this.q2r[k] += r.q2r[k];
      this.q2i[k] += r.q2i[k];
    }
  }

  /** 南北に奇対称（q(x, −y) = −q(x, y)）な成分だけ残す＝南北の壁で ψ = 0 */
  private makeOdd(): void {
    for (const a of [this.q1r, this.q1i, this.q2r, this.q2i]) {
      for (let j = 0; j <= this.nyc / 2; j++) {
        const jm = (this.nyc - j) % this.nyc;
        for (let i = 0; i < this.nx; i++) {
          const k = j * this.nx + i;
          const km = jm * this.nx + i;
          if (k === km) {
            a[k] = 0;
            continue;
          }
          const v = 0.5 * (a[k] - a[km]);
          a[k] = v;
          a[km] = -v;
        }
      }
    }
  }

  private resetClock(): void {
    this.t = 0;
    this.steps = 0;
    this.cloudLag = 0;
    this.hist = [];
    this.highCloud.fill(0);
    this.lowCloud.fill(0);
    this.w.fill(0);
    this.coldAdv.fill(0);
    this.u1.fill(0);
    this.v1.fill(0);
    this.u2.fill(0);
    this.v2.fill(0);
  }

  private scaleTo(rmsSpeed: number): void {
    const e = this.eddyKineticEnergy();
    if (e <= 0) return;
    const s = rmsSpeed / Math.sqrt(2 * e);
    for (const a of [this.q1r, this.q1i, this.q2r, this.q2i])
      for (let k = 0; k < a.length; k++) a[k] *= s;
  }

  /** スペクトルの q から ψ を求める（M⁻¹ をかける） */
  private invert(
    q1r: Float64Array,
    q1i: Float64Array,
    q2r: Float64Array,
    q2i: Float64Array,
    p1r: Float64Array,
    p1i: Float64Array,
    p2r: Float64Array,
    p2i: Float64Array
  ): void {
    const F = this.d.F;
    for (let k = 0; k < this.size; k++) {
      const K2 = this.K2[k];
      if (K2 === 0) {
        p1r[k] = p1i[k] = p2r[k] = p2i[k] = 0;
        continue;
      }
      const a = -K2 - F;
      const det = K2 * (K2 + 2 * F);
      p1r[k] = (a * q1r[k] - F * q2r[k]) / det;
      p1i[k] = (a * q1i[k] - F * q2i[k]) / det;
      p2r[k] = (-F * q1r[k] + a * q2r[k]) / det;
      p2i[k] = (-F * q1i[k] + a * q2i[k]) / det;
    }
  }

  /** 渦（東西平均からのずれ）の運動エネルギー（両層の平均）1/2 <|∇ψ|²> [m²/s²] */
  eddyKineticEnergy(): number {
    const n = this.size;
    const p1r = new Float64Array(n);
    const p1i = new Float64Array(n);
    const p2r = new Float64Array(n);
    const p2i = new Float64Array(n);
    this.invert(this.q1r, this.q1i, this.q2r, this.q2i, p1r, p1i, p2r, p2i);
    let s = 0;
    for (let k = 0; k < n; k++) {
      // 東西平均の流れ（ジェット）は除いて、東西に変化する渦だけ数える
      if (k % this.nx === 0) continue;
      s += this.K2[k] * (p1r[k] ** 2 + p1i[k] ** 2 + p2r[k] ** 2 + p2i[k] ** 2);
    }
    // パーセバル: <f²> = Σ|f̂|² / N²、2層の平均
    return (0.5 * s) / (n * n) / 2;
  }

  /**
   * 傾向 ∂q/∂t をスペクトルで返す。副作用として物理空間の u, v を更新する。
   */
  private tendency(): {
    r1r: Float64Array;
    r1i: Float64Array;
    r2r: Float64Array;
    r2i: Float64Array;
  } {
    const n = this.size;
    const { U1, U2, Q1y, Q2y } = this.d;
    const r = this.params.drag;
    const relax = this.params.zonalRelax;
    const p1r = new Float64Array(n);
    const p1i = new Float64Array(n);
    const p2r = new Float64Array(n);
    const p2i = new Float64Array(n);
    this.invert(this.q1r, this.q1i, this.q2r, this.q2i, p1r, p1i, p2r, p2i);

    const nl: Float64Array[] = [];
    const layers = [
      { qr: this.q1r, qi: this.q1i, pr: p1r, pi: p1i, u: this.u1, v: this.v1 },
      { qr: this.q2r, qi: this.q2i, pr: p2r, pi: p2i, u: this.u2, v: this.v2 },
    ];
    for (const L of layers) {
      // u + i v を1回の逆変換で（u = −ψ_y, v = ψ_x、どちらも実数）
      // û = −i l ψ̂, v̂ = i k ψ̂  →  û + i v̂ = −i l ψ̂ − k ψ̂
      const ar = this.wr;
      const ai = this.wi;
      const br = this.xr;
      const bi = this.xi;
      for (let k = 0; k < n; k++) {
        const kx = this.kx[k];
        const ky = this.ky[k];
        const pr = L.pr[k];
        const pi = L.pi[k];
        // −i l ψ = l pi − i l pr ;  −k ψ = −k pr − i k pi
        ar[k] = ky * pi - kx * pr;
        ai[k] = -ky * pr - kx * pi;
        // q_x + i q_y : i k q − l q
        const qr = L.qr[k];
        const qi = L.qi[k];
        br[k] = -kx * qi - ky * qr;
        bi[k] = kx * qr - ky * qi;
      }
      fft2d(ar, ai, this.nx, this.nyc, true);
      fft2d(br, bi, this.nx, this.nyc, true);
      const J = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        L.u[k] = ar[k];
        L.v[k] = ai[k];
        J[k] = ar[k] * br[k] + ai[k] * bi[k];
      }
      nl.push(J);
    }
    // 2つの非線形項を1回の順変換で: Z = J1 + i J2
    const zr = this.wr;
    const zi = this.wi;
    zr.set(nl[0]);
    zi.set(nl[1]);
    fft2d(zr, zi, this.nx, this.nyc, false);

    const r1r = new Float64Array(n);
    const r1i = new Float64Array(n);
    const r2r = new Float64Array(n);
    const r2i = new Float64Array(n);
    for (let j = 0; j < this.nyc; j++) {
      const jm = (this.nyc - j) % this.nyc;
      for (let i = 0; i < this.nx; i++) {
        const im = (this.nx - i) % this.nx;
        const k = j * this.nx + i;
        const km = jm * this.nx + im;
        // Ĵ1 = (Z(k) + conj Z(−k))/2,  Ĵ2 = (Z(k) − conj Z(−k))/(2i)
        const j1r = 0.5 * (zr[k] + zr[km]);
        const j1i = 0.5 * (zi[k] - zi[km]);
        const j2r = 0.5 * (zi[k] + zi[km]);
        const j2i = -0.5 * (zr[k] - zr[km]);
        const kx = this.kx[k];
        // −U ∂x q − Q_y ∂x ψ − J : −i k (U q + Q_y ψ) − Ĵ
        const s1r = U1 * this.q1r[k] + Q1y * p1r[k];
        const s1i = U1 * this.q1i[k] + Q1y * p1i[k];
        const s2r = U2 * this.q2r[k] + Q2y * p2r[k];
        const s2i = U2 * this.q2i[k] + Q2y * p2i[k];
        r1r[k] = kx * s1i - j1r;
        r1i[k] = -kx * s1r - j1i;
        if (i === 0) {
          // 帯状平均（東西波数 0）は基準の状態へ戻す
          const ref = this.ref;
          r1r[k] -= relax * (this.q1r[k] - (ref ? ref.q1r[k] : 0));
          r1i[k] -= relax * (this.q1i[k] - (ref ? ref.q1i[k] : 0));
          r2r[k] = -relax * (this.q2r[k] - (ref ? ref.q2r[k] : 0));
          r2i[k] = -relax * (this.q2i[k] - (ref ? ref.q2i[k] : 0));
        } else {
          r2r[k] = 0;
          r2i[k] = 0;
        }
        // 地表摩擦: ∂q2/∂t += −r ∇²ψ2 = r K² ψ̂2
        r2r[k] += kx * s2i - j2r + r * this.K2[k] * p2r[k];
        r2i[k] += -kx * s2r - j2i + r * this.K2[k] * p2i[k];
      }
    }
    return { r1r, r1i, r2r, r2i };
  }

  /** dt だけ進める */
  step(): void {
    const n = this.size;
    const R = this.tendency();
    this.adaptTimeStep();
    this.diagnose(R);
    this.hist.unshift(R);
    if (this.hist.length > 3) this.hist.length = 3;
    const h = this.hist;
    let c: number[];
    if (h.length === 1) c = [1];
    else if (h.length === 2) c = [1.5, -0.5];
    else c = [23 / 12, -16 / 12, 5 / 12];
    const dt = this.dt;
    const targets = [
      [this.q1r, "r1r"],
      [this.q1i, "r1i"],
      [this.q2r, "r2r"],
      [this.q2i, "r2i"],
    ] as const;
    for (const [q, key] of targets) {
      for (let k = 0; k < n; k++) {
        let inc = 0;
        for (let m = 0; m < c.length; m++) inc += c[m] * h[m][key][k];
        q[k] = (q[k] + dt * inc) * this.filter[k];
      }
    }
    // 丸め誤差で対称性が崩れないように毎回そろえる
    this.makeOdd();
    // 雲は30分ぶんたまったらまとめて動かす（セミラグランジュ法なので大きな刻みでも安定）
    this.cloudLag += dt;
    if (this.cloudLag >= 1800) {
      this.advectClouds(this.cloudLag);
      this.cloudLag = 0;
    }
    this.t += dt;
    this.steps++;
  }

  /**
   * CFL 条件 |u|·dt/dx ≲ 0.4 を満たすように時間刻みを選び直す。
   * 刻みを変えたら Adams–Bashforth の履歴は使えないので捨てる（1〜2歩は低次で進む）。
   */
  private adaptTimeStep(): void {
    const { U1, U2 } = this.d;
    let umax = 1e-6;
    for (let k = 0; k < this.size; k++) {
      umax = Math.max(
        umax,
        Math.abs(U1 + this.u1[k]),
        Math.abs(this.v1[k]),
        Math.abs(U2 + this.u2[k]),
        Math.abs(this.v2[k])
      );
    }
    const limit = Math.min(this.dtMax, (0.4 * Math.min(this.dx, this.dy)) / umax);
    if (limit < this.dt) {
      this.dt = limit;
      this.hist = [];
    } else if (limit > 1.5 * this.dt && this.dt < this.dtMax) {
      this.dt = Math.min(this.dtMax, 0.8 * limit);
      this.hist = [];
    }
  }

  /** 傾向から鉛直流 w と下層の寒気移流を求める */
  private diagnose(R: {
    r1r: Float64Array;
    r1i: Float64Array;
    r2r: Float64Array;
    r2i: Float64Array;
  }) {
    const n = this.size;
    const { U1, U2, F, f0, tempPerPsi } = this.d;
    const shear = this.d.shearMean;
    // ∂(ψ1 − ψ2)/∂t = M⁻¹ ∂q/∂t の差。M⁻¹ の差の行は (a + F)/det · (q1 − q2) = −(q1−q2)/(K²+2F)
    const ar = this.wr;
    const ai = this.wi;
    for (let k = 0; k < n; k++) {
      const K2 = this.K2[k];
      if (K2 === 0) {
        ar[k] = ai[k] = 0;
        continue;
      }
      const s = -1 / (K2 + 2 * F);
      ar[k] = s * (R.r1r[k] - R.r2r[k]);
      ai[k] = s * (R.r1i[k] - R.r2i[k]);
    }
    fft2d(ar, ai, this.nx, this.nyc, true);
    const N2 = this.params.N ** 2;
    const bPerPsi = f0 / LAYER_DEPTH;
    const Um = 0.5 * (U1 + U2);
    for (let k = 0; k < n; k++) {
      // τ = ψ1 − ψ2 の勾配（背景込み）: τ_x = v1 − v2, τ_y = −(u1 − u2) − (U1 − U2)
      const tx = this.v1[k] - this.v2[k];
      const ty = -(this.u1[k] - this.u2[k]) - shear;
      const um = Um + 0.5 * (this.u1[k] + this.u2[k]);
      const vm = 0.5 * (this.v1[k] + this.v2[k]);
      const Dtau = ar[k] + um * tx + vm * ty;
      // 熱の式 Db/Dt = −N² w
      this.w[k] = (-bPerPsi * Dtau) / N2;
      const u2 = U2 + this.u2[k];
      this.coldAdv[k] = -tempPerPsi * (u2 * tx + this.v2[k] * ty);
    }
  }

  /**
   * 物理空間の ψ1（上層）と ψ1 − ψ2 を返す（擾乱のみ）。描画用。
   * 配列は計算格子（nx × nyc）だが、水路の中は行 0〜ny だけ。
   */
  fields(): { psi1: Float64Array; tau: Float64Array } {
    const n = this.size;
    const p1r = new Float64Array(n);
    const p1i = new Float64Array(n);
    const p2r = new Float64Array(n);
    const p2i = new Float64Array(n);
    this.invert(this.q1r, this.q1i, this.q2r, this.q2i, p1r, p1i, p2r, p2i);
    // ψ1 + i(ψ1 − ψ2) を1回の逆変換で
    for (let k = 0; k < n; k++) {
      this.wr[k] = p1r[k] - (p1i[k] - p2i[k]);
      this.wi[k] = p1i[k] + (p1r[k] - p2r[k]);
    }
    fft2d(this.wr, this.wi, this.nx, this.nyc, true);
    return { psi1: Float64Array.from(this.wr), tau: Float64Array.from(this.wi) };
  }

  /** 中層の気温 [℃]（背景の南北勾配込み、水路の中央で offset ℃）。行 0〜ny。 */
  temperatureField(tau: Float64Array, offsetC = 5): Float64Array {
    const out = new Float64Array(this.nx * (this.ny + 1));
    const c = this.d.tempPerPsi;
    for (let j = 0; j <= this.ny; j++) {
      const y = j * this.dy - this.Ly / 2;
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        out[k] = offsetC + c * (tau[k] - this.d.shearMean * y);
      }
    }
    return out;
  }

  /** 粗い格子の場 f を、格子座標 (x, y)（x は周期、y は 0〜ny）で双線形補間 */
  sample(f: ArrayLike<number>, x: number, y: number): number {
    const nx = this.nx;
    x = ((x % nx) + nx) % nx;
    y = Math.min(this.ny - 1e-9, Math.max(0, y));
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    const fx = x - i0;
    const fy = y - j0;
    const i1 = (i0 + 1) % nx;
    const j1 = j0 + 1;
    return (
      (1 - fy) * ((1 - fx) * f[j0 * nx + i0] + fx * f[j0 * nx + i1]) +
      fy * ((1 - fx) * f[j1 * nx + i0] + fx * f[j1 * nx + i1])
    );
  }

  /**
   * 雲を風で流し、上昇域で上層雲、寒気移流域で下層雲を作る（セミラグランジュ法）。
   * 雲そのものは力学に影響しない受け身の量（潜熱は入れていない）。
   */
  private advectClouds(dt: number): void {
    const { cnx, cny } = this;
    const s = cnx / this.nx;
    const { U1, U2 } = this.d;
    const dxc = this.dx / s;
    const dyc = this.dy / s;
    const oldH = this.highCloud;
    const oldL = this.lowCloud;
    const newH = new Float32Array(oldH.length);
    const newL = new Float32Array(oldL.length);
    const decayH = Math.exp(-dt / (1.2 * 86400));
    const decayL = Math.exp(-dt / (0.6 * 86400));
    const wThreshold = 0.015; // 1.5 cm/s を超える上昇で雲が育つ
    const growH = 1 / (0.02 * 6 * 3600); // しきい値より 2 cm/s 強い上昇なら約6時間で一面の雲に
    const coldThreshold = 5 / 86400; // 5 K/日 を超える寒気移流
    const growL = 1 / ((10 / 86400) * 8 * 3600);
    const sampleCloud = (f: Float32Array, x: number, y: number) => {
      x = ((x % cnx) + cnx) % cnx;
      y = Math.min(cny - 1, Math.max(0, y));
      const i0 = Math.floor(x);
      const j0 = Math.min(cny - 2, Math.floor(y));
      const fx = x - i0;
      const fy = y - j0;
      const i1 = (i0 + 1) % cnx;
      const j1 = j0 + 1;
      return (
        (1 - fy) * ((1 - fx) * f[j0 * cnx + i0] + fx * f[j0 * cnx + i1]) +
        fy * ((1 - fx) * f[j1 * cnx + i0] + fx * f[j1 * cnx + i1])
      );
    };
    for (let j = 0; j < cny; j++) {
      // 細かい格子の中心を粗い格子座標に（粗い格子の点 j は y = j·dy）
      const yc = (j + 0.5) / s;
      for (let i = 0; i < cnx; i++) {
        const xc = (i + 0.5) / s;
        const k = j * cnx + i;
        const w = this.sample(this.w, xc, yc);
        const ca = this.sample(this.coldAdv, xc, yc);
        // 上層雲は上層の風で
        const ux1 = U1 + this.sample(this.u1, xc, yc);
        const vy1 = this.sample(this.v1, xc, yc);
        let h = sampleCloud(oldH, i - (ux1 * dt) / dxc, j - (vy1 * dt) / dyc) * decayH;
        if (w > wThreshold) h += (w - wThreshold) * growH * dt;
        newH[k] = Math.min(1, h);
        // 下層雲は下層の風で
        const ux2 = U2 + this.sample(this.u2, xc, yc);
        const vy2 = this.sample(this.v2, xc, yc);
        let lo = sampleCloud(oldL, i - (ux2 * dt) / dxc, j - (vy2 * dt) / dyc) * decayL;
        if (-ca > coldThreshold) lo += (-ca - coldThreshold) * growL * dt;
        newL[k] = Math.min(1, lo);
      }
    }
    this.highCloud = newH;
    this.lowCloud = newL;
  }

  /** 熱の運び方の指標: 鉛直流と気温の相関 <w τ'>（正なら暖気が昇り寒気が沈む） */
  warmRisingCorrelation(): number {
    const { tau } = this.fields();
    let s = 0;
    for (let k = 0; k < this.size; k++) s += this.w[k] * tau[k];
    return s / this.size;
  }
}

// ===================================================================================
// 等値線（マーチングスクエア）
// ===================================================================================

/** nx × ny の場 f の値 level の等値線を線分の列で返す（格子座標）。周期の継ぎ目はつながない。 */
export function contourSegments(
  f: ArrayLike<number>,
  nx: number,
  ny: number,
  level: number
): number[] {
  const out: number[] = [];
  const at = (i: number, j: number) => f[j * nx + i] - level;
  const lerp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const pts: number[] = [];
      if (a > 0 !== b > 0) pts.push(i + lerp(a, b), j);
      if (b > 0 !== c > 0) pts.push(i + 1, j + lerp(b, c));
      if (c > 0 !== d > 0) pts.push(i + 1 - lerp(c, d), j + 1);
      if (d > 0 !== a > 0) pts.push(i, j + 1 - lerp(d, a));
      if (pts.length === 4) out.push(...pts);
      else if (pts.length === 8) out.push(...pts);
    }
  }
  return out;
}
