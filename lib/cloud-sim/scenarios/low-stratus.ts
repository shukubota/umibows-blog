// 層雲（放射霧）：晴れた風の弱い夜の1次元の鉛直カラム。
// 液水温位 θ_l と全水量 q_t を乱流拡散（陰解法）で解き、各層で飽和調節して霧水を求める。
// 地面の温度は熱収支（赤外放射・日射・顕熱・潜熱・地中伝導）で解く。
import { defineSim } from "../types";
import {
  CP,
  LV,
  P0,
  RD,
  RHO_W,
  T0,
  clamp,
  dewpoint,
  pressureAt,
  qsat,
  saturationAdjust,
} from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawSky } from "../draw";
import type { SkyKind } from "../draw";

const KAPPA = RD / CP;
/** 層の数と厚さ [m] */
export const ST_N = 100;
export const ST_DZ = 5;
const ZTOP = ST_N * ST_DZ;
const SIGMA = 5.67e-8;
/** 晴天の大気の実効射出率 */
const EPS_A = 0.8;
/** 霧の長波の質量吸収係数 [m^2/kg]（0.15 m^2/g） */
const K_LW = 150;
/** 地表のバルク交換係数 */
const C_H = 8e-3;
/** 地面（表層数 cm）の熱容量 [J/(m^2 K)] と地中への熱伝導 [W/(m^2 K)] */
const C_G = 1.2e5;
const LAMBDA_G = 1;
/** 地面の日射の反射率と、晴天の正午の日射 [W/m^2] */
const ALBEDO = 0.2;
const S_NOON = 650;
/** 露のないときの地面の蒸発効率 */
const BETA_SOIL = 0.1;
/** 露のつきやすさ（草の葉の表面抵抗のぶん、熱の交換より小さくする） */
const DEW_EFF = 0.1;
/** 霧にさえぎられた日射のうち、霧が吸収する割合 */
const A_SW = 0.1;
/** 夕方の地上気温 [K] */
const T_EVENING = T0 + 15;
/** 開始時刻（18時）と終了（翌12時） */
const START_HOUR = 18;
export const ST_DURATION = 18 * 3600;
const KARMAN = 0.4;
/** 空気の粘性係数 [Pa s] */
const MU_AIR = 1.8e-5;
/** 晴れた夜の接地層の空気自身の放射冷却 [K/s] とその厚さの目安 [m] */
const CLEAR_COOL = 1.0 / 3600;
const CLEAR_COOL_H = 25;

export interface StState {
  t: number;
  thl: Float64Array;
  qt: Float64Array;
  T: Float64Array;
  qv: Float64Array;
  ql: Float64Array;
  /** 地面の温度 [K] */
  Ts: number;
  /** 地面にたまった露 [kg/m^2] */
  dew: number;
  /** 地面から空気への顕熱 [W/m^2] */
  H: number;
  /** 地面の正味の上向き赤外放射 [W/m^2] */
  Fg: number;
  /** 地面に届いた日射 [W/m^2] */
  Sg: number;
  /** はじめて液水が出た時刻 [s]（まだなら -1） */
  firstLiquid: number;
}

const Z = Float64Array.from({ length: ST_N }, (_, k) => (k + 0.5) * ST_DZ);
const P = Float64Array.from(Z, (z) => pressureAt(z));
const EXNER = Float64Array.from(P, (p) => Math.pow(p / P0, KAPPA));
const PS = pressureAt(0);

/** コシュミーダーの式による視程 [m]。W は液水量 [kg/m^3]、r は雲粒半径 [m] */
export function extinction(W: number, r: number): number {
  return (3 * W) / (2 * RHO_W * r);
}
export function visibility(W: number, r: number): number {
  const beta = extinction(W, r);
  return beta > 0 ? 3.912 / beta : Infinity;
}

function rho(s: StState, k: number): number {
  return P[k] / (RD * s.T[k]);
}

/** 時刻 [時]（0〜24） */
export function stClock(t: number): number {
  return (START_HOUR + t / 3600) % 24;
}

/** 晴天の地面に届く日射（6時日の出、18時日の入り） */
function solar(t: number): number {
  const hour = stClock(t);
  if (hour <= 6 || hour >= 18) return 0;
  return S_NOON * Math.sin((Math.PI * (hour - 6)) / 12);
}

function adjustAll(s: StState) {
  for (let k = 0; k < ST_N; k++) {
    const r = saturationAdjust(s.thl[k] * EXNER[k], s.qt[k], 0, P[k]);
    s.T[k] = r.T;
    s.qv[k] = r.qv;
    s.ql[k] = r.ql;
  }
}

/** 霧（視程 1 km 未満）の層の範囲。なければ null */
export function fogLayer(s: StState, rMicron: number): { base: number; top: number } | null {
  const r = rMicron * 1e-6;
  let lo = -1;
  let hi = -1;
  for (let k = 0; k < ST_N; k++) {
    if (visibility(rho(s, k) * s.ql[k], r) < 1000) {
      if (lo < 0) lo = k;
      hi = k;
    }
  }
  if (lo < 0) return null;
  return { base: lo === 0 ? 0 : lo * ST_DZ, top: (hi + 1) * ST_DZ };
}

/** 三重対角の連立方程式（陰解法の拡散）をトーマス法で解く。x を上書きする */
const cp_ = new Float64Array(ST_N);
const dp_ = new Float64Array(ST_N);
function diffuseImplicit(x: Float64Array, K: Float64Array, dt: number) {
  // K[j] は層 j-1 と j のあいだの境界（j = 1..N-1）。K[0] と K[N] は 0（地面・上端は別扱い）
  const c = dt / (ST_DZ * ST_DZ);
  for (let k = 0; k < ST_N; k++) {
    const a = k > 0 ? -c * K[k] : 0;
    const cc = k < ST_N - 1 ? -c * K[k + 1] : 0;
    const b = 1 - a - cc;
    if (k === 0) {
      cp_[0] = cc / b;
      dp_[0] = x[0] / b;
    } else {
      const m = b - a * cp_[k - 1];
      cp_[k] = cc / m;
      dp_[k] = (x[k] - a * dp_[k - 1]) / m;
    }
  }
  x[ST_N - 1] = dp_[ST_N - 1];
  for (let k = ST_N - 2; k >= 0; k--) x[k] = dp_[k] - cp_[k] * x[k + 1];
}

const Kbuf = new Float64Array(ST_N + 1);
const Fbuf = new Float64Array(ST_N + 1);

function substep(s: StState, U: number, rMicron: number, dt: number) {
  // --- 赤外放射：F(z) = F0 exp(-k W(z))、W(z) はその高さより上の液水経路
  let lwp = 0;
  let fogTopK = -1;
  for (let k = ST_N - 1; k >= 0; k--) {
    lwp += rho(s, k) * s.ql[k] * ST_DZ;
    if (fogTopK < 0 && s.ql[k] > 1e-6) fogTopK = k;
  }
  // 宇宙へ向けて赤外線を出す面の温度：霧がなければ地面、厚い霧なら霧の上端
  const em = 1 - Math.exp(-K_LW * lwp);
  const Te = fogTopK >= 0 ? (1 - em) * s.Ts + em * s.T[fogTopK] : s.Ts;
  const F0 = Math.max(SIGMA * Math.pow(Te, 4) - EPS_A * SIGMA * Math.pow(T_EVENING, 4), 0);
  let W = 0;
  Fbuf[ST_N] = F0;
  for (let k = ST_N - 1; k >= 0; k--) {
    W += rho(s, k) * s.ql[k] * ST_DZ;
    Fbuf[k] = F0 * Math.exp(-K_LW * W);
  }
  // 霧が吸収する日射（霧の液水量に比例して配る）
  const tau = (3 * lwp) / (2 * RHO_W * rMicron * 1e-6); // 霧の光学的厚さ
  const trans = 1 / (1 + 0.75 * (1 - 0.85) * tau);
  const sunTop = solar(s.t);
  const swFog = lwp > 0 ? (A_SW * sunTop * (1 - trans)) / lwp : 0; // [W/kg]
  for (let k = 0; k < ST_N; k++) {
    let heat = -(Fbuf[k + 1] - Fbuf[k]) / (rho(s, k) * CP * ST_DZ); // [K/s]
    heat += (swFog * s.ql[k]) / CP;
    // 晴れた空気そのものの放射冷却（水蒸気の赤外放射）。霧の中では霧の項に置き換わる
    if (s.ql[k] <= 0) heat -= CLEAR_COOL * Math.exp(-Z[k] / CLEAR_COOL_H);
    s.thl[k] += (heat / EXNER[k]) * dt;
  }

  // --- 地面の熱収支
  s.Sg = (1 - ALBEDO) * sunTop * trans;
  s.Fg = Fbuf[0];
  const rho0 = rho(s, 0);
  const wstar = Math.cbrt((9.81 / s.T[0]) * (Math.max(s.H, 0) / (rho0 * CP)) * 300);
  const ch = C_H * (U + wstar);
  s.H = rho0 * CP * ch * (s.Ts - s.T[0]);
  let E = rho0 * ch * (qsat(s.Ts, PS) - s.qv[0]); // [kg/(m^2 s)]、負なら露
  if (E < 0) E *= DEW_EFF;
  else {
    const fromDew = Math.min(E, s.dew / dt);
    E = fromDew + BETA_SOIL * (E - fromDew);
  }
  s.dew = Math.max(0, s.dew - E * dt);
  const G = LAMBDA_G * (T_EVENING - 2 - s.Ts);
  s.Ts += ((s.Sg - s.Fg - s.H - LV * E + G) / C_G) * dt;
  s.thl[0] += (s.H / (rho0 * CP * ST_DZ) / EXNER[0]) * dt;
  s.qt[0] = Math.max(1e-6, s.qt[0] + (E / (rho0 * ST_DZ)) * dt);

  // --- 乱流拡散係数
  const ustar = 0.05 * U;
  let fogTop = 0;
  let wf = 0;
  if (fogTopK >= 0) {
    fogTop = (fogTopK + 1) * ST_DZ;
    const dFtop = F0 - Fbuf[0];
    wf = Math.cbrt((9.81 / s.T[fogTopK]) * (dFtop / (rho0 * CP)) * fogTop);
  }
  Kbuf[0] = 0;
  Kbuf[ST_N] = 0;
  for (let j = 1; j < ST_N; j++) {
    const z = j * ST_DZ;
    let K = 0.01 + KARMAN * ustar * z * Math.exp(-z / 60);
    if (wstar > 0) K += KARMAN * wstar * z * Math.pow(1 - z / ZTOP, 2);
    if (z < fogTop) K += 0.03 * wf * fogTop;
    Kbuf[j] = K;
  }
  diffuseImplicit(s.thl, Kbuf, dt);
  diffuseImplicit(s.qt, Kbuf, dt);
  adjustAll(s);

  // --- 霧粒の落下（ストークスの終端速度で上から下へ運び、地面に着いたら露に加える）
  const r = rMicron * 1e-6;
  const vt = (2 * RHO_W * 9.81 * r * r) / (9 * MU_AIR);
  let inflow = 0; // 上の層から入ってくる液水 [kg/(m^2 s)]
  for (let k = ST_N - 1; k >= 0; k--) {
    const rk = rho(s, k);
    const out = rk * s.ql[k] * vt;
    const dql = ((inflow - out) * dt) / (rk * ST_DZ);
    s.ql[k] += dql;
    s.qt[k] += dql;
    s.thl[k] -= (LV / (CP * EXNER[k])) * dql;
    inflow = out;
  }
  s.dew += inflow * dt;
  s.t += dt;
  if (s.firstLiquid < 0 && s.ql.some((q) => q > 0)) s.firstLiquid = s.t;
}

function initState(rh: number): StState {
  const s: StState = {
    t: 0,
    thl: new Float64Array(ST_N),
    qt: new Float64Array(ST_N),
    T: new Float64Array(ST_N),
    qv: new Float64Array(ST_N),
    ql: new Float64Array(ST_N),
    Ts: T_EVENING,
    dew: 0,
    H: 0,
    Fg: 0,
    Sg: 0,
    firstLiquid: -1,
  };
  const q0 = rh * qsat(T_EVENING, PS);
  const th0 = T_EVENING / Math.pow(PS / P0, KAPPA);
  for (let k = 0; k < ST_N; k++) {
    s.thl[k] = th0 + 0.006 * Z[k];
    s.qt[k] = q0 * (1 - 0.001 * Z[k]);
  }
  adjustAll(s);
  return s;
}

function fmtClock(t: number): string {
  const m = Math.floor(stClock(t) * 60 + 1e-6);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function skyKind(hour: number): SkyKind {
  if (hour >= 7.5 && hour < 17) return "day";
  if ((hour >= 5.5 && hour < 7.5) || (hour >= 17 && hour < 18.5)) return "dusk";
  return "night";
}

export const stratusSim = defineSim<StState>({
  id: "stratus",
  title: "放射霧ができて、持ち上がって層雲になるまで（一晩〜朝）",
  description: [
    String.raw`18時から翌日の12時まで、地面から高さ $500\,\mathrm{m}$ までの空気を厚さ $5\,\mathrm{m}$ の100層に分けた1次元のカラムで計算しています。各層の液水温位 $\theta_l$ と全水量 $q_t$ を乱流拡散の式で（陰解法で）時間発展させ、毎ステップ飽和調節して気温・水蒸気・霧水を求めます。地面の温度は熱収支の式で解いています。`,
    String.raw`晴れた夜、地面は赤外線を出して冷え、その地面に触れた空気が顕熱で冷やされ、乱流で上へ冷たさが広がります。地面近くの空気自身も赤外線を出して少し冷えます。気温が露点まで下がった層で凝結が始まり、霧ができます。霧ができると、地面の代わりに霧の上端が赤外線を出して冷える（霧は下からの赤外線を吸い、地面には霧から赤外線が返る）ので、霧は上へ厚くなっていきます。`,
    String.raw`冷えた地面には露がつき、霧粒も少しずつ落ちて地面に着くので、霧の底の水は減っていきます。夜明けごろには霧の底が地面を離れて層雲になり、6時に日が昇ると、霧を透かした日射が地面を暖めて対流が起き、雲は下から蒸発して消えていきます。視程は最下層の霧水量からコシュミーダーの式で計算し、視程 $1\,\mathrm{km}$ 未満の層を霧・層雲としています（底が地面に接していれば霧）。`,
    String.raw`簡単にした点：風速は乱流拡散係数 $K$ と地面との交換の強さにだけ効かせ、夜の安定層では $K = 0.01 + \kappa u_\ast z\,e^{-z/60\,\mathrm{m}}$（$u_\ast = 0.05\,U$）とし、昼は地面の加熱による対流、霧の中は上端の冷却による対流のぶんを足しています。上空の大気からの赤外線は夕方の気温で決めて固定し、晴れた空気自身の冷却は地面近くで $1\,\mathrm{K\,h^{-1}}$（高さ $25\,\mathrm{m}$ ごとに $1/e$）と決め打ちしています。地面は表層の熱容量 $1.2\times10^{5}\,\mathrm{J\,m^{-2}\,K^{-1}}$ と地中への弱い熱伝導で表し、露のつき方は熱の交換の $10\%$、露がないときの蒸発は湿った地面の $10\%$ にしています。霧粒の数の変化、移流、霧の水平方向のむらは入れていません。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{\partial \theta_l}{\partial t} = \frac{\partial}{\partial z}\!\left(K\frac{\partial \theta_l}{\partial z}\right) - \frac{1}{\rho c_p \Pi}\frac{\partial F}{\partial z} + Q,\qquad \frac{\partial q_t}{\partial t} = \frac{\partial}{\partial z}\!\left(K\frac{\partial q_t}{\partial z}\right) + \frac{1}{\rho}\frac{\partial (\rho\,q_l\,v_t)}{\partial z}`,
      caption: String.raw`乱流拡散、赤外放射、霧が吸う日射と晴れた空気の冷却 $Q$、霧粒の落下。$\Pi = (p/p_0)^{R_d/c_p}$。地面との熱・水蒸気のやりとりは最下層に入れる`,
    },
    {
      tex: String.raw`F(z) = F_0\,e^{-k\,W(z)},\quad W(z) = \int_z^{\infty}\rho\,q_l\,dz',\quad F_0 = \sigma T_e^{4} - \varepsilon_a\,\sigma T_{\mathrm{eve}}^{4}`,
      caption: String.raw`正味の上向き赤外放射。$k = 0.15\,\mathrm{m^2\,g^{-1}}$、$\varepsilon_a = 0.8$、$T_e$ は霧がなければ地面、厚い霧なら霧の上端の温度。霧がなければ地面が、霧があれば霧の上端が冷える`,
    },
    {
      tex: String.raw`C_g\frac{dT_s}{dt} = (1-\alpha)\,S\,\mathcal{T} - F(0) - H - L_v E + \lambda_g\,(T_{\mathrm{deep}} - T_s)`,
      caption: String.raw`地面の熱収支。$H = \rho c_p C_H (U + w_\ast)(T_s - T_1)$、$E \propto \rho C_H (U + w_\ast)(q_s(T_s) - q_{v1})$ は負なら露、$\mathcal{T} = 1/(1 + 0.11\,\tau)$ は霧を透かす日射の割合、$\tau = 3\,\mathrm{LWP}/(2\rho_w r)$`,
    },
    {
      tex: String.raw`(T, q_v, q_l) = \mathrm{SatAdj}(\theta_l\,\Pi,\ q_t),\qquad v_t = \frac{2\rho_w g\,r^{2}}{9\mu}`,
      caption:
        "各層で過飽和ぶんを凝結させ（未飽和なら霧水を蒸発させ）、霧粒はストークスの終端速度で落とす",
    },
    {
      tex: String.raw`\beta = \frac{3W}{2\rho_w r},\quad W = \rho\,q_l,\qquad V = \frac{3.912}{\beta}`,
      caption: String.raw`最下層の液水量 $W$ と霧粒の半径 $r$ から消散係数 $\beta$ と視程 $V$ を求める（コシュミーダーの式）`,
    },
  ],
  params: [
    { key: "rh", label: "夕方の地上の相対湿度", min: 60, max: 98, step: 1, value: 85, unit: "%" },
    {
      key: "wind",
      label: "風の強さ U（乱流の強さ）",
      min: 0.5,
      max: 5,
      step: 0.25,
      value: 1.5,
      unit: "m/s",
      digits: 2,
    },
    { key: "r", label: "霧粒の半径", min: 2, max: 20, step: 1, value: 6, unit: "µm" },
  ],
  timeScale: 1080,
  maxDt: 30,
  duration: ST_DURATION,
  aspect: 0.6,
  init(p) {
    return initState(p.rh / 100);
  },
  step(s, p, dt) {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(20, left);
      substep(s, clamp(p.wind, 0.1, 20), clamp(p.r, 1, 50), h);
      left -= h;
    }
  },
  draw(ctx, s, p, w, h) {
    const hour = stClock(s.t);
    drawSky(ctx, { x: 0, y: 0, w, h }, skyKind(hour));
    const groundH = Math.max(14, h * 0.08);
    const groundY = h - groundH;
    const toY = (z: number) => groundY - (z / ZTOP) * (groundY - 10);

    // 太陽
    if (hour > 6 && hour < 18) {
      const a = (Math.PI * (hour - 6)) / 12;
      const sx = w * (0.08 + 0.5 * (1 - Math.cos(a)) * 0.5);
      const sy = groundY - Math.sin(a) * (groundY * 0.85);
      ctx.fillStyle = "rgba(253,224,71,0.9)";
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHeightAxis(ctx, { x: 0, y: 0, w, h: groundY }, ZTOP, toY, 0.1);

    // 地面と木
    ctx.fillStyle = "#14321f";
    ctx.fillRect(0, groundY, w, groundH);
    ctx.fillStyle = "#0f2a1a";
    for (let i = 0; i < 9; i++) {
      const x = ((i * 0.137 + 0.05) % 1) * w;
      const th = 8 + ((i * 7) % 5) * 3; // 木の高さ [m]
      const ty = toY(th + 4);
      ctx.beginPath();
      ctx.moveTo(x - 6, groundY);
      ctx.lineTo(x, ty);
      ctx.lineTo(x + 6, groundY);
      ctx.closePath();
      ctx.fill();
    }

    // 霧：各層を横 300 m の見通しで見たときの不透明度で塗る
    const r = p.r * 1e-6;
    for (let k = 0; k < ST_N; k++) {
      if (s.ql[k] <= 0) continue;
      const beta = extinction(rho(s, k) * s.ql[k], r);
      const alpha = 1 - Math.exp(-beta * 300);
      if (alpha < 0.01) continue;
      const y0 = toY((k + 1) * ST_DZ);
      const y1 = k === 0 ? groundY : toY(k * ST_DZ);
      ctx.fillStyle = `rgba(226,232,240,${(0.92 * alpha).toFixed(3)})`;
      ctx.fillRect(0, y0, w, y1 - y0 + 0.5);
    }
    // 霧の上端のうねり（見た目）
    const fog = fogLayer(s, p.r);
    if (fog) {
      const yt = toY(fog.top);
      ctx.fillStyle = "rgba(226,232,240,0.35)";
      for (let x = 0; x < w; x += 24) {
        const dy = 3 * Math.sin(x * 0.05 + s.t / 900);
        ctx.beginPath();
        ctx.ellipse(x + 12, yt + dy, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawLabel(ctx, fmtClock(s.t), 6, h - 4, "rgba(255,255,255,0.9)");
    drawLabel(
      ctx,
      s.dew > 1e-3 ? `露 ${(s.dew * 1000).toFixed(0)} g/m²` : "",
      w - 6,
      h - 4,
      "rgba(191,219,254,0.9)",
      "right"
    );

    // 気温と露点の鉛直分布
    const pw = clamp(w * 0.34, 120, 230);
    const ph = clamp(h * 0.62, 90, 230);
    const tPts: [number, number][] = [[s.Ts - T0, 0]];
    const dPts: [number, number][] = [];
    for (let k = 0; k < ST_N; k++) {
      tPts.push([s.T[k] - T0, Z[k]]);
      dPts.push([dewpoint(s.qv[k], P[k]) - T0, Z[k]]);
    }
    const all = [...tPts, ...dPts].map((q) => q[0]);
    const lo = Math.floor(Math.min(...all)) - 1;
    const hi = Math.ceil(Math.max(...all)) + 1;
    drawPlot(
      ctx,
      { x: w - pw - 4, y: 4, w: pw, h: ph },
      [
        { points: tPts, color: "#f87171" },
        { points: dPts, color: "#60a5fa", dash: [4, 3] },
      ],
      { xRange: [lo, hi], yRange: [0, ZTOP], xLabel: "℃", title: "気温(赤)・露点(青) [m]" }
    );
  },
  readouts(s, p) {
    const fog = fogLayer(s, p.r);
    const W0 = rho(s, 0) * s.ql[0];
    const V = visibility(W0, p.r * 1e-6);
    let state = "なし";
    if (fog && fog.base === 0) state = `霧（上端 ${fog.top.toFixed(0)} m）`;
    else if (fog) state = `層雲 ${fog.base.toFixed(0)}〜${fog.top.toFixed(0)} m`;
    return [
      { label: "時刻", value: fmtClock(s.t) },
      { label: "霧・層雲", value: state },
      {
        label: "地上の視程",
        value:
          V >= 10000
            ? "10 km 以上"
            : `${V < 1000 ? V.toFixed(0) + " m" : (V / 1000).toFixed(1) + " km"}`,
      },
      {
        label: "地上の気温 / 露点",
        value: `${(s.T[0] - T0).toFixed(1)} / ${(dewpoint(s.qv[0], P[0]) - T0).toFixed(1)} ℃`,
      },
    ];
  },
  time: (s) => s.t,
});
