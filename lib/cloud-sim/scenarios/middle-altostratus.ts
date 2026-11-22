// 高層雲: 温暖前線の前線面をはい上がる暖気の 2 次元断面。
// 前線とともに動く座標で、暖気の空気塊を前線面に平行な道すじに沿って持ち上げ、
// 乾燥断熱の冷却と飽和調節で雲水を計算する。地上の観測者には前線が近づいてくる。
import { defineSim, type Params } from "../types";
import { GAMMA_D, clamp, pressureAt, qsat, saturationAdjust } from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawSky, type Rect } from "../draw";

const r = String.raw;

/** 暖気が前線面に対して斜面を上る向きに進む速さ [m/s] */
export const AS_U_REL = 10;
export const AS_XI_MIN = -100e3;
export const AS_XI_MAX = 1300e3;
/** 観測者の最初の位置（地上の前線から前方へ）[m] */
export const AS_XI_OBS0 = 1200e3;
/** 対流圏界面。ここより上には昇らない */
export const AS_Z_TROP = 11000;
const Z_MAX = 11000;
const LEVEL_DZ = 200;
const N_LEVELS = 26; // 前線に入る前の高さ d = 0〜5 km
const PER_LEVEL = 140;
const SPACING = (AS_XI_MAX - AS_XI_MIN) / PER_LEVEL;
const T_WARM_SURFACE = 291.15; // 暖域の地上気温 18 ℃
const CLOUD_QL = 1e-5;
const HISTORY_DT = 900;

export interface AsParcel {
  xi: number;
  d: number;
  z: number;
  T: number;
  qv: number;
  ql: number;
}

export interface AltostratusState {
  t: number;
  parcels: AsParcel[];
  /** 観測者の頭上で測った雲底 [時間, km] */
  history: [number, number][];
  nextHistory: number;
}

/** 暖域の空気（高さ d）の相対湿度: 下層 2 km はパラメータの値、その上は 5 km で半分まで下げる */
function warmRH(d: number, rh: number): number {
  return d <= 2000 ? rh : rh * (1 - (0.5 * (d - 2000)) / 3000);
}

function entryParcel(xi: number, d: number, rhPct: number, slope: number): AsParcel {
  const T = T_WARM_SURFACE - 0.0065 * d;
  const qv = warmRH(d, rhPct / 100) * qsat(T, pressureAt(d));
  const p: AsParcel = { xi, d, z: d, T, qv, ql: 0 };
  liftTo(p, pathHeight(xi, d, slope));
  return p;
}

/** 前線面 z = ξ tanα に平行な道すじの高さ */
export function pathHeight(xi: number, d: number, slope: number): number {
  return Math.min(d + slope * Math.max(xi, 0), AS_Z_TROP);
}

function liftTo(q: AsParcel, z: number) {
  const adj = saturationAdjust(q.T - GAMMA_D * (z - q.z), q.qv, q.ql, pressureAt(z));
  q.z = z;
  q.T = adj.T;
  q.qv = adj.qv;
  q.ql = adj.ql;
}

export function slopeOf(p: Params): number {
  return 1 / p.slope;
}

export function observerXi(s: AltostratusState, p: Params): number {
  return AS_XI_OBS0 - p.c * s.t;
}

/** 前方 ξ の地点の真上の雲（±half の範囲の空気塊から）。雲がなければ null */
export function columnCloud(
  s: AltostratusState,
  xi: number,
  half = SPACING
): { base: number; top: number } | null {
  let base = Infinity;
  let top = -Infinity;
  for (const q of s.parcels) {
    if (Math.abs(q.xi - xi) > half || q.ql <= CLOUD_QL) continue;
    base = Math.min(base, q.z);
    top = Math.max(top, q.z);
  }
  return Number.isFinite(base) ? { base, top } : null;
}

/** 雲底の高さだけで決めた雲の種類（目安） */
export function cloudKind(base: number | null): string {
  if (base === null) return "雲なし";
  if (base >= 7000) return "巻雲";
  if (base >= 5000) return "巻層雲";
  if (base >= 2000) return "高層雲";
  return "乱層雲";
}

export const altostratusSim = defineSim<AltostratusState>({
  id: "altostratus",
  title: "温暖前線の斜面をはい上がる暖気",
  description: [
    r`温暖前線の鉛直断面です。地上の前線（左の赤い記号）から右の前方へ、冷たい空気（青い部分）の上に傾き $\tan\alpha$ の前線面がのびています。図は前線といっしょに動く座標で描いていて、前線は右へ速さ $c$ で進むので、右の地上にいる観測者が前線に近づいてくるように見えます（横は 1400 km、縦は 11 km なので、斜面は実際よりずっと急に見えます）。`,
    r`左の暖域から、高さ $d = 0$〜$5\,\mathrm{km}$ の暖かく湿った空気塊（地上 18 ℃、下層 2 km の相対湿度はパラメータ、その上は乾いていく）が、前線に対して $U = 10\,\mathrm{m\,s^{-1}}$ で前線面に乗り上げます。前線面の上の暖気は温位の等しい面（前線面にほぼ平行）に沿って動くとみなし、各空気塊を前線面に平行な道すじ $z = d + \xi\tan\alpha$ に沿って持ち上げます。上昇速度は $w = U\tan\alpha$ で、毎ステップ乾燥断熱で冷やし、飽和調節で過飽和分を凝結させます。白い部分が雲水をもつ空気塊です。`,
    r`前線面に接した空気がいちばん下で凝結するので、雲底はほぼ前線面そのもので、地上の前線からの距離 $\xi$ の所の雲底は $\xi\tan\alpha$ になります。左上のグラフは観測者の真上の雲底の変化（点）と、この関係 $\xi_{\mathrm{obs}}(t)\tan\alpha$（点線）です。雲底が下がるにつれて、雲の種類を巻雲 → 巻層雲 → 高層雲 → 乱層雲と表示します。`,
    r`簡単にした点: 前線面は平らで動かず、暖気の流れは一様、雲粒は落ちず（降水なし）、氷にもなりません。雲の種類は雲底の高さ（7 km 以上を巻雲、5〜7 km を巻層雲、2〜5 km を高層雲、2 km 未満を乱層雲）だけで目安として分けています。対流圏界面（11 km）より上には昇らないとしました。`,
  ],
  equations: [
    {
      tex: r`\frac{d\xi}{dt} = U,\qquad z = d + \xi\tan\alpha\;\;(\xi > 0),\qquad w = U\tan\alpha`,
      caption:
        "前線とともに動く座標での空気塊の動き。$\\xi$ は地上の前線から前方への距離、$d$ は前線に入る前の高さ、$\\alpha$ は前線面の傾きの角です。",
    },
    {
      tex: r`\frac{dT}{dt} = -\frac{g}{c_p}\,w,\qquad q_v = q_s(T, p)\;\;(\text{飽和のとき、}\;T + \tfrac{L_v}{c_p}q_l,\;q_v + q_l\;\text{を保つ})`,
      caption: "乾燥断熱の冷却と飽和調節。凝結の潜熱で冷え方は湿潤断熱減率まで弱まります。",
    },
    {
      tex: r`\xi_{\mathrm{obs}}(t) = \xi_0 - c\,t,\qquad z_{\mathrm{base}} \approx \xi_{\mathrm{obs}}\tan\alpha`,
      caption:
        "観測者と前線の距離と、その真上の雲底。$c$ は前線の移動速度、$\\xi_0 = 1200\\,\\mathrm{km}$ は最初の距離です。",
    },
  ],
  params: [
    {
      key: "slope",
      label: "前線面の傾き 1/",
      min: 80,
      max: 300,
      step: 10,
      value: 150,
      unit: "",
    },
    { key: "rh", label: "暖気の相対湿度", min: 50, max: 100, step: 1, value: 85, unit: "%" },
    { key: "c", label: "前線の移動速度", min: 5, max: 15, step: 0.5, value: 10, unit: "m/s" },
  ],
  timeScale: 2000,
  maxDt: 300,
  duration: 36 * 3600,
  aspect: 0.55,
  init(p) {
    const slope = slopeOf(p);
    const parcels: AsParcel[] = [];
    for (let k = 0; k < N_LEVELS; k++) {
      const d = k * LEVEL_DZ;
      const phase = (k * 0.6180339887) % 1;
      for (let j = 0; j < PER_LEVEL; j++) {
        parcels.push(entryParcel(AS_XI_MIN + (j + phase) * SPACING, d, p.rh, slope));
      }
    }
    return { t: 0, parcels, history: [], nextHistory: 0 };
  },
  step(s, p, dt) {
    const slope = slopeOf(p);
    for (const q of s.parcels) {
      q.xi += AS_U_REL * dt;
      if (q.xi > AS_XI_MAX) {
        Object.assign(q, entryParcel(q.xi - (AS_XI_MAX - AS_XI_MIN), q.d, p.rh, slope));
        continue;
      }
      liftTo(q, pathHeight(q.xi, q.d, slope));
    }
    s.t += dt;
    if (s.t >= s.nextHistory) {
      s.nextHistory += HISTORY_DT;
      const xo = observerXi(s, p);
      const col = xo > AS_XI_MIN ? columnCloud(s, xo) : null;
      if (col) s.history.push([s.t / 3600, col.base / 1000]);
    }
  },
  draw(ctx, s, p, w, h) {
    const full: Rect = { x: 0, y: 0, w, h };
    drawSky(ctx, full, "day");
    const slope = slopeOf(p);
    const toX = (xi: number) => ((xi - AS_XI_MIN) / (AS_XI_MAX - AS_XI_MIN)) * w;
    const toY = (z: number) => h - (z / Z_MAX) * h;
    drawHeightAxis(ctx, full, Z_MAX, toY, 2);

    // 寒気（前線面の下）
    ctx.fillStyle = "rgba(56,130,246,0.28)";
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    const xiTop = Math.min(AS_XI_MAX, Z_MAX / slope);
    ctx.lineTo(toX(xiTop), toY(slope * xiTop));
    if (xiTop < AS_XI_MAX) ctx.lineTo(toX(AS_XI_MAX), toY(Z_MAX));
    ctx.lineTo(toX(AS_XI_MAX), toY(0));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(248,113,113,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(xiTop), toY(slope * xiTop));
    ctx.stroke();

    // 空気塊と雲
    const cw = (SPACING / (AS_XI_MAX - AS_XI_MIN)) * w + 1;
    const ch = (LEVEL_DZ / Z_MAX) * h + 1;
    for (const q of s.parcels) {
      const X = toX(q.xi);
      const Y = toY(q.z);
      if (q.ql > CLOUD_QL) {
        const a = clamp(0.25 + q.ql * 500, 0.25, 0.85);
        ctx.fillStyle = `rgba(241,245,249,${a})`;
        ctx.fillRect(X - cw / 2, Y - ch / 2, cw, ch);
      } else {
        ctx.fillStyle = "rgba(254,215,170,0.35)";
        ctx.fillRect(X - 0.6, Y - 0.6, 1.2, 1.2);
      }
    }

    // 地上の温暖前線の記号（赤い半円）
    ctx.fillStyle = "#ef4444";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(toX(0) - 14 + i * 10, h, 4, Math.PI, 0);
      ctx.fill();
    }
    drawLabel(ctx, "暖気 →", toX(-60e3), toY(6000), "rgba(254,215,170,0.9)");
    drawLabel(ctx, "寒気", toX(1100e3), h - 6, "rgba(191,219,254,0.9)", "center");
    drawLabel(ctx, "地上の前線", toX(0) + 4, h - 8, "rgba(254,202,202,0.9)");

    // 観測者
    const xo = observerXi(s, p);
    if (xo > AS_XI_MIN) {
      const X = toX(xo);
      ctx.strokeStyle = "rgba(250,204,21,0.6)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, h - 12);
      ctx.lineTo(X, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(X, h - 11, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(X - 1, h - 8, 2, 8);
      const col = columnCloud(s, xo);
      drawLabel(
        ctx,
        `観測者: ${cloudKind(col ? col.base : null)}`,
        clamp(X, 60, w - 60),
        h - 22,
        "#fde68a",
        "center"
      );
    }

    // 観測者の真上の雲底の時間変化
    const pw = Math.min(240, w * 0.42);
    const ph = Math.min(105, h * 0.34);
    const T_END = 36;
    const theory: [number, number][] = [];
    for (let i = 0; i <= 36; i++) {
      const tt = (T_END * i) / 36;
      const xi = AS_XI_OBS0 - p.c * tt * 3600;
      if (xi < 0) break;
      theory.push([tt, Math.min(slope * xi, AS_Z_TROP) / 1000]);
    }
    const dots = s.history;
    drawPlot(
      ctx,
      { x: 40, y: 4, w: pw, h: ph },
      [
        { points: theory, color: "#fbbf24", dash: [4, 3] },
        { points: dots, color: "#f8fafc" },
      ],
      {
        title: "観測者の真上の雲底 [km]（点線: ξ tanα）",
        xLabel: "時間",
        xRange: [0, T_END],
        yRange: [0, 11],
      }
    );
  },
  readouts(s, p) {
    const xo = observerXi(s, p);
    const col = xo > AS_XI_MIN ? columnCloud(s, xo) : null;
    const w = AS_U_REL * slopeOf(p);
    return [
      {
        label: "観測者から地上の前線まで",
        value: xo > 0 ? `${Math.round(xo / 1000)} km 前方` : "前線は通過しました",
      },
      { label: "頭上の雲", value: cloudKind(col ? col.base : null) },
      { label: "雲底", value: col ? `${(col.base / 1000).toFixed(1)} km` : "—" },
      { label: "前線面に沿った上昇速度", value: `${(w * 100).toFixed(1)} cm/s` },
    ];
  },
  time: (s) => s.t,
});
