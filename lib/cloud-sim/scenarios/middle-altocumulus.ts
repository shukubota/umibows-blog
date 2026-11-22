// 高積雲（レンズ雲・つるし雲）: 山岳波の線形解の流線に沿って空気塊を流し、
// 持ち上げによる断熱冷却と飽和調節で雲水を計算する。
import { computeMountainWaves, type MountainWaveParams, type WaveField } from "@/lib/atmos-waves";
import { defineSim, type Params } from "../types";
import { GAMMA_D, clamp, pressureAt, qsat, saturationAdjust, seededRandom } from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawPuff, drawSky, type Rect } from "../draw";

const r = String.raw;

export const AC_X_MIN = -20e3;
export const AC_X_MAX = 60e3;
const Z_MAX = 8000;
const NX = 161;
const NZ = 33;
/** 湿った層（流れてくる上流での高さ） */
export const AC_MOIST_BOTTOM = 3600;
export const AC_MOIST_TOP = 4400;
const N_PARCELS = 900;
/** 色を付けて追いかける空気塊の数 */
const N_TRACKED = 3;
const N1 = 0.012;
const N2 = 0.005;
const LAYER_H = 5000;
const MOUNTAIN_A = 2500;
const T_SURFACE = 288.15;

/** 浮力振動数 N から決めた環境の気温 [K]（dθ/dz = N²θ/g、2層で値を変える） */
function envTemperature(z: number): number {
  const lapse = (n: number) => GAMMA_D - (n * n * 290) / 9.81; // [K/m]
  const l1 = lapse(N1);
  if (z <= LAYER_H) return T_SURFACE - l1 * z;
  return T_SURFACE - l1 * LAYER_H - lapse(N2) * (z - LAYER_H);
}

export interface AcParcel {
  x: number;
  /** 上流での高さ [m] */
  z0: number;
  z: number;
  T: number;
  qv: number;
  ql: number;
}

export interface AltocumulusState {
  t: number;
  field: WaveField;
  parcels: AcParcel[];
  /** 湿った層の中央の高さでの η(x)（描画・判定用） */
  etaMid: Float64Array;
  /** 雲ができるのに必要な持ち上げの目安 125 m/K × 露点差 [m] */
  liftNeeded: number;
}

export function etaAt(field: WaveField, x: number, z: number): number {
  const { xs, zs, eta } = field;
  const nx = xs.length;
  const nz = zs.length;
  const fx = ((x - xs[0]) / (xs[nx - 1] - xs[0])) * (nx - 1);
  const fz = ((z - zs[0]) / (zs[nz - 1] - zs[0])) * (nz - 1);
  const ix = clamp(Math.floor(fx), 0, nx - 2);
  const iz = clamp(Math.floor(fz), 0, nz - 2);
  const tx = clamp(fx - ix, 0, 1);
  const tz = clamp(fz - iz, 0, 1);
  const a = eta[iz * nx + ix];
  const b = eta[iz * nx + ix + 1];
  const c = eta[(iz + 1) * nx + ix];
  const d = eta[(iz + 1) * nx + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function mountainWaveParams(p: Params): MountainWaveParams {
  return { U: p.U, N1, N2, H: LAYER_H, h0: p.h0, a: MOUNTAIN_A };
}

/** 上流（高さ z0、露点差 dd）の空気を、変位 η の位置まで乾燥断熱で動かして飽和調節した状態 */
function parcelAt(x: number, z0: number, field: WaveField, dd: number): AcParcel {
  const T0 = envTemperature(z0);
  const qv0 = qsat(T0 - dd, pressureAt(z0));
  const z = z0 + etaAt(field, x, z0);
  const adj = saturationAdjust(T0 - GAMMA_D * (z - z0), qv0, 0, pressureAt(z));
  return { x, z0, z, T: adj.T, qv: adj.qv, ql: adj.ql };
}

const CLOUD_QL = 1e-5; // 1e-5 kg/kg = 0.01 g/kg 以上を雲とみなす

/** 雲（液水のある空気塊）の範囲。最初の（山にいちばん近い）レンズの x の範囲と中心 */
export function firstLens(s: AltocumulusState): { x0: number; x1: number; xc: number } | null {
  const xs = s.parcels.filter((q) => q.ql > CLOUD_QL && q.x > -8000).map((q) => q.x);
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  // 2 km 以上のすき間で区切って、最初のかたまりを取る
  let end = 0;
  while (end + 1 < xs.length && xs[end + 1] - xs[end] < 2000) end++;
  const x0 = xs[0];
  const x1 = xs[end];
  return { x0, x1, xc: (x0 + x1) / 2 };
}

export const altocumulusSim = defineSim<AltocumulusState>({
  id: "altocumulus",
  title: "山を越える風の波とレンズ雲（つるし雲）",
  description: [
    r`左の山を一様な風 $U$ が越えると、風下に止まった波（山岳波）ができます。流線の上下の変位 $\eta(x, z)$ は、「大気の波」のページと同じ 2 層大気の線形・定常の解（フーリエ合成）で一度だけ求めます。下層（高さ 5 km まで）の浮力振動数は $N_1 = 0.012\,\mathrm{s^{-1}}$、上層は $N_2 = 0.005\,\mathrm{s^{-1}}$、山はベル形（半値幅 2.5 km）です。`,
    r`上流の高さ 3.6〜4.4 km に露点差 $T - T_d$ の小さい湿った層があるとし、その中の 900 個の空気塊を風速 $U$ で流します。各空気塊は流線 $z = z_0 + \eta(x, z_0)$ に沿って動き、高さの変化に応じて乾燥断熱で温度が変わり、毎ステップの飽和調節で過飽和の分を凝結（未飽和なら蒸発）させます。白いもやが液水をもつ空気塊、オレンジの点は追いかけている空気塊です。`,
    r`空気塊は左から右へ流れ抜けているのに、雲は波の山（流線がいちばん持ち上がった所）の位置にじっと止まっています。上昇域（波の山の風上側）で凝結し、下降域（風下側）で蒸発するからです。右上のグラフは湿った層の中央の流線の変位で、点線の「必要な持ち上げ」を超えた所だけが雲になります。`,
    r`簡単にした点: 波は線形の定常解で、雲の潜熱が波に返す効果や、山の上の非線形な強い下降流は入れていません。気圧は標準大気の値を使い、雲粒の落下や氷化はありません。山の高さを大きくしたときの振幅は線形理論の値なので、実際より誇張される場合があります。`,
  ],
  equations: [
    {
      tex: r`\frac{d^2\hat\eta}{dz^2} + \left(l^2 - k^2\right)\hat\eta = 0,\qquad l = \frac{N}{U}`,
      caption:
        "各層での山岳波の鉛直構造（線形・定常）。$\\hat\\eta$ は流線の変位 $\\eta$ のフーリエ成分、$k$ は水平波数、$l$ は Scorer パラメータです。地面で $\\eta = h(x)$、層の境で連続、上層は上向きに放射する条件で解きます。",
    },
    {
      tex: r`\frac{dx}{dt} = U,\qquad z = z_0 + \eta(x, z_0),\qquad \frac{dT}{dt} = -\frac{g}{c_p}\frac{dz}{dt}`,
      caption:
        "空気塊の移動と乾燥断熱の温度変化。$z_0$ は上流での高さ、$g/c_p \\approx 9.8\\,\\mathrm{K\\,km^{-1}}$ は乾燥断熱減率です。",
    },
    {
      tex: r`T + \frac{L_v}{c_p}q_l,\;\; q_v + q_l \;\text{を保って}\;\; q_v = q_s(T, p)\;\;(\text{飽和のとき})`,
      caption:
        "飽和調節。過飽和なら凝結して潜熱で温まり、液水 $q_l$ があって未飽和なら蒸発させます。$q_s$ は飽和混合比、$L_v$ は蒸発の潜熱です。",
    },
  ],
  params: [
    { key: "U", label: "風速 U", min: 6, max: 25, step: 1, value: 12, unit: "m/s" },
    { key: "h0", label: "山の高さ", min: 200, max: 1200, step: 50, value: 700, unit: "m" },
    {
      key: "dd",
      label: "湿った層の露点差",
      min: 0,
      max: 8,
      step: 0.25,
      value: 1.5,
      unit: "K",
      digits: 2,
    },
  ],
  timeScale: 150,
  maxDt: 10,
  aspect: 0.55,
  init(p) {
    const xs = Float64Array.from(
      { length: NX },
      (_, i) => AC_X_MIN + ((AC_X_MAX - AC_X_MIN) * i) / (NX - 1)
    );
    const zs = Float64Array.from({ length: NZ }, (_, i) => (Z_MAX * i) / (NZ - 1));
    const field = computeMountainWaves(mountainWaveParams(p), xs, zs, { nk: 600 });
    const rnd = seededRandom(7);
    const parcels: AcParcel[] = [];
    for (let i = 0; i < N_PARCELS; i++) {
      const x = AC_X_MIN + (AC_X_MAX - AC_X_MIN) * rnd();
      const z0 =
        i < N_TRACKED
          ? (AC_MOIST_BOTTOM + AC_MOIST_TOP) / 2 + (i - 1) * 200
          : AC_MOIST_BOTTOM + (AC_MOIST_TOP - AC_MOIST_BOTTOM) * rnd();
      parcels.push(parcelAt(i < N_TRACKED ? AC_X_MIN + i * 4000 : x, z0, field, p.dd));
    }
    const zMid = (AC_MOIST_BOTTOM + AC_MOIST_TOP) / 2;
    const etaMid = Float64Array.from(xs, (x) => etaAt(field, x, zMid));
    return { t: 0, field, parcels, etaMid, liftNeeded: 125 * p.dd };
  },
  step(s, p, dt) {
    s.t += dt;
    for (const q of s.parcels) {
      q.x += p.U * dt;
      if (q.x > AC_X_MAX) {
        // 右端から出た空気塊は、上流の新しい空気として左端に戻す
        const nq = parcelAt(AC_X_MIN + (q.x - AC_X_MAX), q.z0, s.field, p.dd);
        Object.assign(q, nq);
        continue;
      }
      const z = q.z0 + etaAt(s.field, q.x, q.z0);
      const T = q.T - GAMMA_D * (z - q.z);
      const adj = saturationAdjust(T, q.qv, q.ql, pressureAt(z));
      q.z = z;
      q.T = adj.T;
      q.qv = adj.qv;
      q.ql = adj.ql;
    }
  },
  draw(ctx, s, p, w, h) {
    const full: Rect = { x: 0, y: 0, w, h };
    drawSky(ctx, full, "day");
    const toX = (x: number) => ((x - AC_X_MIN) / (AC_X_MAX - AC_X_MIN)) * w;
    const toY = (z: number) => h - (z / Z_MAX) * h;
    drawHeightAxis(ctx, full, Z_MAX, toY, 2);

    // 流線（上流の高さ 1, 2, 3, 5, 6, 7 km）と湿った層の上下
    const line = (z0: number, color: string, width: number, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const x = AC_X_MIN + ((AC_X_MAX - AC_X_MIN) * i) / 160;
        const y = toY(z0 + etaAt(s.field, x, z0));
        if (i === 0) ctx.moveTo(toX(x), y);
        else ctx.lineTo(toX(x), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const z0 of [1000, 2000, 3000, 5000, 6000, 7000]) line(z0, "rgba(255,255,255,0.18)", 1);
    line(AC_MOIST_BOTTOM, "rgba(125,211,252,0.45)", 1, [4, 4]);
    line(AC_MOIST_TOP, "rgba(125,211,252,0.45)", 1, [4, 4]);

    // 山
    ctx.fillStyle = "#3f4a3a";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 200; i++) {
      const x = AC_X_MIN + ((AC_X_MAX - AC_X_MIN) * i) / 200;
      const hz = (p.h0 * MOUNTAIN_A * MOUNTAIN_A) / (x * x + MOUNTAIN_A * MOUNTAIN_A);
      ctx.lineTo(toX(x), toY(hz));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 空気塊（乾いたものは小さな点、液水があれば白いもや）
    const puffR = Math.max(4, w * 0.012);
    for (let i = N_TRACKED; i < s.parcels.length; i++) {
      const q = s.parcels[i];
      const X = toX(q.x);
      const Y = toY(q.z);
      if (q.ql > CLOUD_QL) {
        drawPuff(ctx, X, Y, puffR, clamp(0.12 + q.ql * 400, 0.12, 0.6));
      } else {
        ctx.fillStyle = "rgba(186,230,253,0.35)";
        ctx.fillRect(X - 0.75, Y - 0.75, 1.5, 1.5);
      }
    }
    // 追いかける空気塊: 通ってきた道すじと現在位置
    for (let i = 0; i < N_TRACKED; i++) {
      const q = s.parcels[i];
      ctx.strokeStyle = "rgba(251,146,60,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = 40;
      for (let j = 0; j <= n; j++) {
        const x =
          Math.max(AC_X_MIN, q.x - 15000) + ((q.x - Math.max(AC_X_MIN, q.x - 15000)) * j) / n;
        const y = toY(q.z0 + etaAt(s.field, x, q.z0));
        if (j === 0) ctx.moveTo(toX(x), y);
        else ctx.lineTo(toX(x), y);
      }
      ctx.stroke();
      ctx.fillStyle = q.ql > CLOUD_QL ? "#fde68a" : "#fb923c";
      ctx.beginPath();
      ctx.arc(toX(q.x), toY(q.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawLabel(ctx, `風 ${p.U} m/s →`, w * 0.2, 14);
    drawLabel(ctx, "山", toX(0), h - 4, "rgba(255,255,255,0.7)", "center");

    // 湿った層の中央の流線の変位と、雲になるのに必要な持ち上げ
    const pw = Math.min(260, w * 0.42);
    const ph = Math.min(110, h * 0.32);
    const pts: [number, number][] = [];
    for (let i = 0; i < s.field.xs.length; i += 2) pts.push([s.field.xs[i] / 1000, s.etaMid[i]]);
    const ext = Math.max(200, s.liftNeeded * 1.2, ...pts.map((q) => Math.abs(q[1])));
    drawPlot(
      ctx,
      { x: w - pw - 4, y: 4, w: pw, h: ph },
      [
        { points: pts, color: "#7dd3fc" },
        {
          points: [
            [AC_X_MIN / 1000, s.liftNeeded],
            [AC_X_MAX / 1000, s.liftNeeded],
          ],
          color: "#fbbf24",
          dash: [4, 3],
        },
      ],
      {
        title: "湿った層の変位 η [m]（点線: 必要な持ち上げ）",
        xLabel: "km",
        xRange: [AC_X_MIN / 1000, AC_X_MAX / 1000],
        yRange: [-ext, ext],
      }
    );
  },
  readouts(s, p) {
    const lens = firstLens(s);
    let qlMax = 0;
    for (const q of s.parcels) qlMax = Math.max(qlMax, q.ql);
    if (!lens) {
      return [
        { label: "雲", value: "できていません" },
        { label: "必要な持ち上げ", value: `${Math.round(s.liftNeeded)} m` },
      ];
    }
    const len = Math.max(lens.x1 - lens.x0, 0);
    return [
      { label: "雲の位置（山から風下へ）", value: `${(lens.xc / 1000).toFixed(1)} km` },
      { label: "雲の長さ", value: `${(len / 1000).toFixed(1)} km` },
      { label: "空気が雲を通り抜ける時間", value: `${Math.round(len / p.U / 60)} 分` },
      { label: "最大の雲水量", value: `${(qlMax * 1000).toFixed(2)} g/kg` },
    ];
  },
  time: (s) => s.t,
});
