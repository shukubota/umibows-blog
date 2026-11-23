// 層積雲：混合層モデル（Lilly 1968 型）。
// 逆転層の高さ z_i、混合層の液水温位 θ_l と全水量 q_t の3つの常微分方程式を RK4 で解く。
import { defineSim } from "../types";
import type { Params } from "../types";
import { CP, P0, RD, T0, clamp, pressureAt, qsat, rk4, saturationAdjust } from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawPuff, drawSky, formatDuration } from "../draw";

const KAPPA = RD / CP;
/** 地上気圧（= 温位の基準気圧とする） */
const PS = P0;
/** 混合層の代表的な密度 [kg/m^3] */
const RHO = 1.15;
/** 海面での熱・水蒸気のバルク交換速度 C_H U [m/s]（C_H ≈ 1e-3, U ≈ 8 m/s） */
export const SC_CHU = 5e-3;
/** エントレインメントの係数 A */
export const SC_A = 0.85;
/** 上空（自由大気）の温位 θ+(z) = θ0+ + Γ+ z */
export const SC_THETA_FT0 = 296;
export const SC_GAMMA_FT = 5e-3;
/** 雲がないときの境界層の放射冷却 [W/m^2] */
const DF_CLEAR = 15;
/** 雲の長波の質量吸収係数 [m^2/kg]（0.15 m^2/g） */
const K_LW = 150;
const DAY = 86400;

export interface ScDiag {
  /** 雲底（持ち上げ凝結高度）[m] */
  zb: number;
  /** 液水経路 [kg/m^2] */
  lwp: number;
  /** 雲頂での実際の放射冷却 [W/m^2] */
  dF: number;
  /** 逆転層での液水温位の段差 [K] */
  dTheta: number;
  /** エントレインメント速度 [m/s] */
  we: number;
}

export interface ScState {
  t: number;
  zi: number;
  thl: number;
  qt: number;
  diag: ScDiag;
  /** [t, zi, zb] を一定間隔で並べたもの */
  hist: number[];
  nextRec: number;
}

function pAt(z: number): number {
  return pressureAt(z, 288.15, 0.0065, PS);
}

/** 混合層の中の高さ z での液水温度 T_l = θ_l (p/p0)^κ */
function tlAt(thl: number, z: number): number {
  return thl * Math.pow(pAt(z) / P0, KAPPA);
}

/** 持ち上げ凝結高度：q_s(T_l(z), p(z)) = q_t となる高さを二分法で求める */
export function scCloudBase(thl: number, qt: number): number {
  if (qsat(tlAt(thl, 0), pAt(0)) <= qt) return 0;
  let lo = 0;
  let hi = 5000;
  if (qsat(tlAt(thl, hi), pAt(hi)) > qt) return hi;
  for (let i = 0; i < 36; i++) {
    const mid = 0.5 * (lo + hi);
    if (qsat(tlAt(thl, mid), pAt(mid)) > qt) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** 雲水量 q_l(z)（飽和調節で求める） */
function qlAt(thl: number, qt: number, z: number): { ql: number; T: number; p: number } {
  const p = pAt(z);
  const r = saturationAdjust(tlAt(thl, z), qt, 0, p);
  return { ql: r.ql, T: r.T, p };
}

export function scFreeTheta(z: number): number {
  return SC_THETA_FT0 + SC_GAMMA_FT * z;
}

export function scDiagnose(zi: number, thl: number, qt: number, dFmax: number): ScDiag {
  const zb = scCloudBase(thl, qt);
  let lwp = 0;
  if (zb < zi) {
    const n = 16;
    const dz = (zi - zb) / n;
    for (let i = 0; i < n; i++) {
      const { ql, T, p } = qlAt(thl, qt, zb + (i + 0.5) * dz);
      lwp += (p / (RD * T)) * ql * dz;
    }
  }
  const emis = 1 - Math.exp(-K_LW * lwp);
  const dF = DF_CLEAR + (Math.max(dFmax, DF_CLEAR) - DF_CLEAR) * emis;
  const dTheta = Math.max(scFreeTheta(zi) - thl, 0.5);
  const we = (SC_A * dF) / (RHO * CP * dTheta);
  return { zb, lwp, dF, dTheta, we };
}

/** 混合層方程式の右辺 y = [z_i, θ_l, q_t] */
export function scTendency(y: number[], p: Params): number[] {
  const zi = Math.max(y[0], 50);
  const thl = y[1];
  const qt = Math.max(y[2], 1e-5);
  const sst = p.sst + T0;
  const D = p.div * 1e-6;
  const qtFree = p.qft * 1e-3;
  const d = scDiagnose(zi, thl, qt, p.dF);
  const qs0 = qsat(sst, PS);
  const dzi = d.we - D * zi;
  const dthl = (SC_CHU * (sst - thl) + d.we * (scFreeTheta(zi) - thl) - d.dF / (RHO * CP)) / zi;
  const dqt = (SC_CHU * (qs0 - qt) + d.we * (qtFree - qt)) / zi;
  return [dzi, dthl, dqt];
}

function record(s: ScState) {
  s.hist.push(s.t / DAY, s.zi, Math.min(s.diag.zb, s.zi));
  if (s.hist.length > 3 * 400) s.hist.splice(0, 3);
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  const d = y1 > y0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x - 3, y1 - 5 * d);
  ctx.lineTo(x + 3, y1 - 5 * d);
  ctx.closePath();
  ctx.fill();
}

export const stratocumulusSim = defineSim<ScState>({
  id: "stratocumulus",
  title: "混合層モデルで見る層積雲の一生（数日間）",
  description: [
    String.raw`冷たい海の上、高気圧の下にある境界層を「上から下までよく混ざった1つの層」とみなし、その厚さ（逆転層の高さ）$z_i$、液水温位 $\theta_l$、全水量 $q_t$ の3つだけで表す混合層モデル（Lilly 1968 型）を、4次のルンゲ＝クッタ法で数日ぶん積分しています。`,
    String.raw`海面からは温度差・湿度差に比例した熱と水蒸気が入り、雲頂では放射冷却 $\Delta F$ で熱が奪われ、逆転層の上の暖かく乾いた空気がエントレインメント速度 $w_e$ で取り込まれます。$w_e$ は「放射冷却が駆動する乱流が、逆転層の温位の段差 $\Delta\theta_l$ に逆らって空気を取り込む」という簡単なクロージャ $w_e = A\,\Delta F/(\rho c_p \Delta\theta_l)$ で決めています（$A = 0.7$）。一方、大規模な沈降 $-Dz_i$ が逆転層を押し下げます。`,
    String.raw`雲底は混合層の空気の持ち上げ凝結高度で、そこから上の液水量は飽和調節で求めています。雲が薄いと赤外線を出しきれないので、雲頂の冷却は液水経路 LWP に応じて弱め、雲がないときは晴天の $15\,\mathrm{W\,m^{-2}}$ にしています。`,
    String.raw`簡単にした点：日射（日変化）、霧雨、雲の層と海面付近の層の切り離し（デカップリング）、雲頂エントレインメント不安定は入れていません。上空の温位は $\theta^+ = 296\,\mathrm{K} + 5\,\mathrm{K\,km^{-1}}\times z$、海上の風によるバルク交換速度は $C_H U = 8\,\mathrm{mm\,s^{-1}}$ に固定し、地上気圧は $1000\,\mathrm{hPa}$ としています。ロール状の模様は見た目のためのもので、計算には入っていません。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dz_i}{dt} = w_e - D\,z_i`,
      caption: String.raw`逆転層（雲頂）の高さの収支。$D$ は大規模な水平発散`,
    },
    {
      tex: String.raw`z_i\frac{d\theta_l}{dt} = C_H U\,(\mathrm{SST} - \theta_l) + w_e\,\big(\theta^+(z_i) - \theta_l\big) - \frac{\Delta F}{\rho c_p}`,
      caption: String.raw`混合層の熱の収支（海面の顕熱、エントレインメント、雲頂の放射冷却）`,
    },
    {
      tex: String.raw`z_i\frac{dq_t}{dt} = C_H U\,\big(q_s(\mathrm{SST}) - q_t\big) + w_e\,\big(q_t^+ - q_t\big)`,
      caption: String.raw`混合層の水の収支（海面からの蒸発と、乾いた空気の取り込み）。$q_t^+$ は逆転層の上の全水量`,
    },
    {
      tex: String.raw`w_e = A\,\frac{\Delta F}{\rho c_p\,\Delta\theta_l},\qquad \Delta\theta_l = \theta^+(z_i) - \theta_l`,
      caption: String.raw`エントレインメントのクロージャ（$A = 0.7$、$\rho = 1.15\,\mathrm{kg\,m^{-3}}$）`,
    },
    {
      tex: String.raw`\Delta F = \Delta F_{\mathrm{clr}} + (\Delta F_{\max} - \Delta F_{\mathrm{clr}})\,\big(1 - e^{-k\,\mathrm{LWP}}\big)`,
      caption: String.raw`雲頂の放射冷却。$k = 0.15\,\mathrm{m^2\,g^{-1}}$、$\Delta F_{\mathrm{clr}} = 15\,\mathrm{W\,m^{-2}}$、$\Delta F_{\max}$ はスライダーの値`,
    },
    {
      tex: String.raw`q_s\big(T_l(z_b),\,p(z_b)\big) = q_t,\qquad T_l(z) = \theta_l\left(\frac{p(z)}{p_0}\right)^{R_d/c_p}`,
      caption: String.raw`雲底 $z_b$ は混合層の空気の持ち上げ凝結高度（二分法で解く）`,
    },
  ],
  params: [
    {
      key: "div",
      label: "大規模な発散 D（沈降の強さ）",
      min: 1,
      max: 8,
      step: 0.5,
      value: 4,
      unit: "×10⁻⁶ /s",
      digits: 1,
    },
    { key: "sst", label: "海面水温", min: 12, max: 24, step: 0.5, value: 16, unit: "℃", digits: 1 },
    { key: "dF", label: "雲頂の放射冷却 ΔF", min: 20, max: 100, step: 5, value: 70, unit: "W/m²" },
    {
      key: "qft",
      label: "逆転層の上の全水量 q_t⁺",
      min: 1,
      max: 8,
      step: 0.5,
      value: 2,
      unit: "g/kg",
      digits: 1,
    },
  ],
  timeScale: 8640,
  maxDt: 600,
  duration: 6 * DAY,
  aspect: 0.6,
  init(p) {
    const sst = p.sst + T0;
    const thl = sst - 2;
    const qt = 0.8 * qsat(thl, PS);
    const zi = 500;
    const s: ScState = {
      t: 0,
      zi,
      thl,
      qt,
      diag: scDiagnose(zi, thl, qt, p.dF),
      hist: [],
      nextRec: 0,
    };
    record(s);
    s.nextRec = 1800;
    return s;
  },
  step(s, p, dt) {
    const y = rk4((_t, v) => scTendency(v, p), s.t, [s.zi, s.thl, s.qt], dt);
    s.zi = clamp(y[0], 50, 5000);
    s.thl = clamp(y[1], 250, 330);
    s.qt = clamp(y[2], 1e-5, 0.04);
    s.t += dt;
    s.diag = scDiagnose(s.zi, s.thl, s.qt, p.dF);
    if (s.t >= s.nextRec) {
      record(s);
      s.nextRec += 1800;
    }
  },
  draw(ctx, s, p, w, h) {
    drawSky(ctx, { x: 0, y: 0, w, h }, "day");
    const zMax = 2500;
    const seaH = Math.max(14, h * 0.07);
    const groundY = h - seaH;
    const toY = (z: number) => groundY - (z / zMax) * (groundY - 8);
    drawHeightAxis(ctx, { x: 0, y: 0, w, h: groundY }, zMax, toY, 0.5);

    // 海
    const sea = ctx.createLinearGradient(0, groundY, 0, h);
    sea.addColorStop(0, "#1d4e89");
    sea.addColorStop(1, "#0b2545");
    ctx.fillStyle = sea;
    ctx.fillRect(0, groundY, w, seaH);

    const { zi } = s;
    const zb = Math.min(s.diag.zb, zi);
    const yTop = toY(zi);
    const yBase = toY(zb);

    // 境界層（逆転層の下）をうっすら色づけ
    ctx.fillStyle = "rgba(148,163,184,0.12)";
    ctx.fillRect(0, yTop, w, groundY - yTop);
    // 逆転層の線
    ctx.strokeStyle = "rgba(251,191,36,0.8)";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yTop);
    ctx.lineTo(w, yTop);
    ctx.stroke();
    ctx.setLineDash([]);

    // 雲の層：平らな雲底と、ロール状のセルでうねる雲頂
    const thickPx = yBase - yTop;
    if (thickPx > 0.5) {
      const cellW = clamp(w / 7, 50, 130);
      const phase = (s.t / 3600) * 0.15;
      const grad = ctx.createLinearGradient(0, yTop, 0, yBase);
      grad.addColorStop(0, "rgba(248,250,252,0.95)");
      grad.addColorStop(1, "rgba(148,163,184,0.9)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      for (let x = 0; x <= w; x += 3) {
        const c = Math.cos((2 * Math.PI * x) / cellW + phase);
        const dip = Math.pow(Math.max(0, -c), 6); // セルどうしのすき間（下降流）
        const y = yTop + thickPx * (0.12 * (1 - c) * 0.5 + 0.55 * dip);
        ctx.lineTo(x, Math.min(y, yBase));
      }
      ctx.lineTo(w, yBase);
      ctx.closePath();
      ctx.fill();
      for (let x = cellW / 2; x < w + cellW; x += cellW) {
        const cx = x - (((phase / (2 * Math.PI)) * cellW) % cellW);
        drawPuff(ctx, cx, yTop + thickPx * 0.3, Math.max(thickPx * 0.6, 4), 0.35);
      }
      // 雲頂の放射冷却（上向きの赤外線）
      for (let x = cellW * 0.25; x < w; x += cellW) {
        arrow(ctx, x, yTop - 2, yTop - 16 - (s.diag.dF / 100) * 14, "rgba(248,113,113,0.85)");
      }
    }

    // 沈降（逆転層より上の下向き矢印、長さ ∝ D z）
    for (let x = 70; x < w; x += Math.max(90, w / 6)) {
      const z = Math.min(zi + 600, zMax - 100);
      const len = clamp(p.div * 3 * (z / 1000), 4, 40);
      arrow(ctx, x, toY(z), toY(z) + len, "rgba(191,219,254,0.7)");
    }

    drawLabel(ctx, `SST ${p.sst.toFixed(1)} ℃`, w - 6, h - 4, "rgba(191,219,254,0.9)", "right");
    drawLabel(ctx, `経過 ${formatDuration(s.t)}`, 6, h - 4, "rgba(255,255,255,0.85)");
    drawLabel(ctx, "逆転層", w - 6, yTop - 4, "rgba(251,191,36,0.9)", "right");

    // z_i と z_b の時間変化
    const pw = clamp(w * 0.42, 140, 300);
    const ph = clamp(h * 0.36, 70, 140);
    const zi1: [number, number][] = [];
    const zb1: [number, number][] = [];
    for (let i = 0; i + 2 < s.hist.length; i += 3) {
      zi1.push([s.hist[i], s.hist[i + 1] / 1000]);
      zb1.push([s.hist[i], s.hist[i + 2] / 1000]);
    }
    zi1.push([s.t / DAY, zi / 1000]);
    zb1.push([s.t / DAY, zb / 1000]);
    drawPlot(
      ctx,
      { x: w - pw - 4, y: 4, w: pw, h: ph },
      [
        { points: zi1, color: "#fbbf24", label: "雲頂" },
        { points: zb1, color: "#e2e8f0", label: "雲底" },
      ],
      { xRange: [0, 6], yRange: [0, 2], xLabel: "日", title: "雲頂(黄)・雲底(白) [km]" }
    );
  },
  readouts(s) {
    const zb = Math.min(s.diag.zb, s.zi);
    const cloudy = s.diag.zb < s.zi;
    return [
      { label: "雲頂（逆転層）", value: `${(s.zi / 1000).toFixed(2)} km` },
      { label: "雲底", value: cloudy ? `${(zb / 1000).toFixed(2)} km` : "雲なし" },
      { label: "エントレインメント速度", value: `${(s.diag.we * 1000).toFixed(1)} mm/s` },
      { label: "液水経路 LWP", value: `${(s.diag.lwp * 1000).toFixed(0)} g/m²` },
    ];
  },
  time: (s) => s.t,
});
