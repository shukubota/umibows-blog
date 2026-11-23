// 巻層雲: 温暖前線の前方で、上空の湿った層が広くゆっくり持ち上げられて氷飽和に達し、
// 薄い氷晶の層が広がる。高さごとの空気塊を断熱的に持ち上げ、氷晶の拡散成長（昇華凝結）と潜熱を解く。
import { defineSim } from "../types";
import type { Params } from "../types";
import { drawLabel, drawPlot, formatDuration } from "../draw";
import {
  airDensity,
  CP,
  eFromMixingRatio,
  esatIce,
  G,
  GAMMA_D,
  LS,
  pressureAt,
  qsat,
  RD,
  RV,
} from "../thermo";
import { iceGrowthCoefficient } from "./high-ice";

/** 空気塊を置く高さの範囲と間隔 [m] */
export const CS_Z_FIRST = 6000;
export const CS_DZ = 100;
export const CS_LEVELS = 41; // 6.0〜10.0 km
/** 湿った層の下端・上端 [m] */
export const CS_MOIST_BOTTOM = 7500;
export const CS_MOIST_TOP = 9500;
/** 湿った層の外の氷に対する相対湿度 */
const RHI_DRY = 0.3;
/** 結晶の有効密度 [kg/m^3] と、生まれたときの直径 [m] */
export const CS_RHO_EFF = 300;
const D0 = 10e-6;
/** 太陽の天頂角（太陽高度 50°） */
const MU0 = Math.cos((40 * Math.PI) / 180);
/** 雲とみなす氷の混合比 [kg/kg] */
const QI_CLOUD = 1e-6;
/** 表示の高さの範囲 [m] */
const Z_LO = 5500;
const Z_HI = 12000;

export function csEnvTemperature(z: number): number {
  return 288.15 - 0.0065 * z;
}

/** はじめの氷に対する相対湿度のプロファイル（湿った層の中で rhi、外で 30%、境目は 150 m でなめらかに） */
export function csInitialRhi(z: number, rhi: number): number {
  const inside =
    0.5 * (Math.tanh((z - CS_MOIST_BOTTOM) / 150) - Math.tanh((z - CS_MOIST_TOP) / 150));
  return RHI_DRY + (rhi - RHI_DRY) * inside;
}

export interface CSState {
  t: number;
  z: Float64Array;
  T: Float64Array;
  qv: Float64Array;
  qi: Float64Array;
  /** 1 kg の空気あたりの氷晶の数（はじめの数濃度と密度から決める。保存される） */
  nPerKg: Float64Array;
  /** 氷晶ができた（一度でも S_i ≥ 1 になった）か */
  active: Uint8Array;
  /** はじめて氷飽和に達した時刻 [s]（まだなら −1） */
  tSat: Float64Array;
  /** [時刻, τ] の記録 */
  hist: number[];
}

function params(p: Params) {
  return {
    w: (p.w ?? 3) / 100,
    rhi: (p.rhi ?? 70) / 100,
    ni: (p.ni ?? 50) * 1000, // [1/m^3]
  };
}

/** 氷に対する飽和比 */
export function csSi(z: number, T: number, qv: number): number {
  const pr = pressureAt(z);
  return eFromMixingRatio(qv, pr) / esatIce(T);
}

/** 1つの結晶の質量から直径 [m]（有効密度の球） */
function diameter(m: number): number {
  return Math.cbrt((6 * m) / (Math.PI * CS_RHO_EFF));
}

/**
 * 1つの高さの空気塊の [z, T, qv, qi] の時間微分。
 * dz/dt = w, dT/dt = −Γ_d w + (L_s/c_p) dq_i/dt, dq_v/dt = −dq_i/dt,
 * dq_i/dt = n · 4πC(S_i − 1)/(F_k + F_d)、C = D/2
 */
function levelRhs(y: number[], w: number, n: number, active: boolean): number[] {
  const [z, T, qv, qi] = y;
  const pr = pressureAt(z);
  const Si = eFromMixingRatio(Math.max(qv, 0), pr) / esatIce(T);
  let dqi = 0;
  if (active || Si >= 1) {
    const m = Math.max(qi / n, (Math.PI / 6) * CS_RHO_EFF * D0 * D0 * D0);
    const dm = 2 * Math.PI * diameter(m) * (Si - 1) * iceGrowthCoefficient(T, pr);
    dqi = qi <= 0 && dm < 0 ? 0 : n * dm;
  }
  return [w, -GAMMA_D * w + (LS / CP) * dqi, -dqi, dqi];
}

/** 光学的厚さ τ = Σ 2 n π (D/2)² Δz（大きな粒の消散効率を 2 とした近似） */
export function csOpticalDepth(s: CSState): number {
  let tau = 0;
  for (let k = 0; k < CS_LEVELS; k++) {
    if (s.qi[k] <= QI_CLOUD * 0.01) continue;
    const pr = pressureAt(s.z[k]);
    const nVol = s.nPerKg[k] * airDensity(s.T[k], pr);
    const D = diameter(s.qi[k] / s.nPerKg[k]);
    tau += 2 * nVol * Math.PI * (D / 2) * (D / 2) * CS_DZ;
  }
  return tau;
}

/** 氷水量の鉛直積分 [kg/m^2] */
function iceWaterPath(s: CSState): number {
  let iwp = 0;
  for (let k = 0; k < CS_LEVELS; k++) {
    if (s.qi[k] <= 0) continue;
    iwp += s.qi[k] * airDensity(s.T[k], pressureAt(s.z[k])) * CS_DZ;
  }
  return iwp;
}

/**
 * 氷飽和に達するまでの時間の解析的な見積もり。混合比が一定のまま持ち上げると
 * d ln S_i/dt = w [L_s Γ_d/(R_v T²) − g/(R_d T)] なので、t = −ln S_i0 / (w [...])
 */
export function csSaturationTimeEstimate(T: number, Si0: number, w: number): number {
  const rate = w * ((LS * GAMMA_D) / (RV * T * T) - G / (RD * T));
  return -Math.log(Si0) / rate;
}

function cloudBounds(s: CSState): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < CS_LEVELS; k++) {
    if (s.qi[k] > QI_CLOUD) {
      lo = Math.min(lo, s.z[k] - CS_DZ / 2);
      hi = Math.max(hi, s.z[k] + CS_DZ / 2);
    }
  }
  return lo < hi ? [lo, hi] : null;
}

/** 空の見え方の段階 */
export function csStage(tau: number): string {
  if (tau < 0.03) return "雲なし（青空）";
  if (tau < 3) return "巻層雲（太陽が透け、ハロが出る）";
  return "高層雲へ（太陽がぼやけ、影が消える）";
}

export const cirrostratusSim = defineSim<CSState>({
  id: "cirrostratus",
  title: "温暖前線の前のゆっくりした上昇と、広がる氷晶のベール",
  description: [
    String.raw`温暖前線の前方の上空を、高さ 6〜10 km に 100 m おきに並べた空気塊の列として表し、全体を一様な上昇速度 $w$（数 cm/s）で持ち上げます。各空気塊の高さ・気温・水蒸気・氷の量を4次のルンゲ＝クッタ法で時間積分しています。はじめは高さ 7.5〜9.5 km だけが湿っています（その外は氷に対する相対湿度 $30\%$）。`,
    String.raw`持ち上げられた空気は乾燥断熱的に冷え、氷に対する飽和比 $S_i$ が上がります。$S_i \ge 1$ になると氷晶が生まれ、拡散成長で水蒸気を取り込み、そのときの昇華の潜熱で温まります。氷水量と結晶の大きさから光学的厚さ $\tau$ を出し、地上から見た空（太陽・ $22^\circ$ ハロ・空の白さ）を描いています。$\tau$ が小さいうちは太陽が透けてハロが見え、$\tau$ が $3$ を超えるころには太陽がぼやけて高層雲に移っていきます。`,
    String.raw`簡単にした点: 氷晶は $S_i \ge 1$ になったとたんに、はじめに決めた数濃度だけ生まれるとしています（実際の不均質核形成には $S_i \approx 1.1\sim1.3$ が必要なことが多いです）。結晶は同じ質量の球（有効密度 $300\ \mathrm{kg/m^3}$）、静電容量は $C = D/2$、結晶の落下・高さどうしの混合・放射は入れていません。気圧は標準大気の高度の関数とし、消散効率は 2、ハロの明るさは単散乱の $\tau e^{-\tau/\mu_0}$ に比例するとして描いています。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dz}{dt} = w,\qquad \frac{dT}{dt} = -\Gamma_d\,w + \frac{L_s}{c_p}\frac{dq_i}{dt},\qquad \frac{dq_v}{dt} = -\frac{dq_i}{dt}`,
      caption: String.raw`持ち上げられる空気塊（$\Gamma_d = g/c_p$、$L_s$ は昇華熱、$q_v$・$q_i$ は水蒸気・氷の混合比）`,
    },
    {
      tex: String.raw`\frac{dq_i}{dt} = n\,\frac{4\pi C\,(S_i-1)}{F_k+F_d},\qquad C = \frac{D}{2},\quad \frac{q_i}{n} = \frac{\pi}{6}\rho_e D^3`,
      caption: String.raw`氷晶（空気 1 kg あたり $n$ 個）の拡散成長。$F_k, F_d$ は熱と水蒸気の伝わりにくさ（巻雲と同じ式）`,
    },
    {
      tex: String.raw`t_{\mathrm{sat}} \approx \frac{-\ln S_{i,0}}{w\left(\dfrac{L_s\Gamma_d}{R_v T^2} - \dfrac{g}{R_d T}\right)}`,
      caption: String.raw`氷飽和に達するまでの時間の見積もり（はじめの飽和比 $S_{i,0}$。計算結果との比較に使います）`,
    },
    {
      tex: String.raw`\tau = \sum_{\text{levels}} 2\,n_v\,\pi\left(\frac{D}{2}\right)^2\Delta z,\qquad \frac{I}{I_0} = e^{-\tau/\mu_0}`,
      caption: String.raw`光学的厚さと直達光の透過率（$n_v$ は体積あたりの数、$\mu_0 = \cos 40^\circ$）`,
    },
  ],
  params: [
    { key: "w", label: "上昇速度", min: 0, max: 15, step: 0.5, value: 3, unit: "cm/s" },
    {
      key: "rhi",
      label: "湿った層の氷に対する相対湿度（はじめ）",
      min: 50,
      max: 100,
      step: 1,
      value: 75,
      unit: "%",
    },
    { key: "ni", label: "氷晶の数濃度", min: 10, max: 500, step: 10, value: 50, unit: "個/L" },
  ],
  timeScale: 480,
  maxDt: 30,
  duration: 8 * 3600,
  aspect: 0.62,
  init(p) {
    const { rhi, ni } = params(p);
    const z = new Float64Array(CS_LEVELS);
    const T = new Float64Array(CS_LEVELS);
    const qv = new Float64Array(CS_LEVELS);
    const qi = new Float64Array(CS_LEVELS);
    const nPerKg = new Float64Array(CS_LEVELS);
    const tSat = new Float64Array(CS_LEVELS).fill(-1);
    for (let k = 0; k < CS_LEVELS; k++) {
      z[k] = CS_Z_FIRST + k * CS_DZ;
      T[k] = csEnvTemperature(z[k]);
      const pr = pressureAt(z[k]);
      qv[k] = csInitialRhi(z[k], rhi) * qsat(T[k], pr, true);
      nPerKg[k] = ni / airDensity(T[k], pr);
    }
    return { t: 0, z, T, qv, qi, nPerKg, active: new Uint8Array(CS_LEVELS), tSat, hist: [0, 0] };
  },
  step(s, p, dt) {
    const { w } = params(p);
    for (let k = 0; k < CS_LEVELS; k++) {
      const n = s.nPerKg[k];
      const act = s.active[k] === 1;
      const y0 = [s.z[k], s.T[k], s.qv[k], s.qi[k]];
      const f = (y: number[]) => levelRhs(y, w, n, act);
      const k1 = f(y0);
      const k2 = f(y0.map((v, i) => v + (dt / 2) * k1[i]));
      const k3 = f(y0.map((v, i) => v + (dt / 2) * k2[i]));
      const k4 = f(y0.map((v, i) => v + dt * k3[i]));
      const y1 = y0.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      s.z[k] = y1[0];
      s.T[k] = y1[1];
      // 氷が負にならないように（昇華しすぎたぶんの水蒸気と冷却を取り消す）
      if (y1[3] < 0) {
        y1[2] += y1[3];
        s.T[k] -= (LS / CP) * y1[3];
        y1[3] = 0;
      }
      s.qv[k] = Math.max(0, y1[2]);
      s.qi[k] = y1[3];
      if (csSi(s.z[k], s.T[k], s.qv[k]) >= 1 - 1e-9) {
        if (!s.active[k] && s.tSat[k] < 0) s.tSat[k] = s.t + dt;
        s.active[k] = 1;
      }
    }
    const tPrev = s.t;
    s.t += dt;
    if (Math.floor(s.t / 600) !== Math.floor(tPrev / 600)) s.hist.push(s.t, csOpticalDepth(s));
  },
  draw(ctx, s, p, w, h) {
    const tau = csOpticalDepth(s);
    // 背景
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);

    // ---- 左: 断面（高さと氷水量）
    const lw = Math.max(120, Math.floor(w * 0.42));
    const toY = (z: number) => h - ((z - Z_LO) / (Z_HI - Z_LO)) * h;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b3a6e");
    g.addColorStop(1, "#3f7fbf");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, lw, h);
    ctx.save();
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let km = 6; km <= 12; km++) {
      const y = toY(km * 1000);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(lw, y);
      ctx.stroke();
      ctx.fillText(`${km} km`, 3, y - 2);
    }
    ctx.restore();
    // 各高さの層: 湿り具合（S_i）を薄い色、氷を白で
    const bandX = 40;
    const bandW = lw - bandX - 6;
    for (let k = 0; k < CS_LEVELS; k++) {
      const y0 = Math.round(toY(s.z[k] + CS_DZ / 2));
      const y1 = Math.round(toY(s.z[k] - CS_DZ / 2));
      const Si = csSi(s.z[k], s.T[k], s.qv[k]);
      const a = Math.max(0, Math.min(0.35, (Si - 0.5) * 0.6));
      ctx.fillStyle = `rgba(125,211,252,${a.toFixed(3)})`;
      ctx.fillRect(bandX, y0, bandW, y1 - y0);
      const qi = s.qi[k];
      if (qi > 0) {
        const al = Math.min(0.95, Math.sqrt(qi * 1e3) * 1.4);
        ctx.fillStyle = `rgba(255,255,255,${al.toFixed(3)})`;
        ctx.fillRect(bandX, y0, bandW, y1 - y0);
      }
    }
    // 上昇の矢印
    const { w: wUp } = params(p);
    if (wUp > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(253,224,71,0.8)";
      ctx.fillStyle = "rgba(253,224,71,0.8)";
      const ax = lw - 14;
      ctx.beginPath();
      ctx.moveTo(ax, toY(6200));
      ctx.lineTo(ax, toY(7000));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, toY(7000) - 6);
      ctx.lineTo(ax - 4, toY(7000));
      ctx.lineTo(ax + 4, toY(7000));
      ctx.fill();
      ctx.restore();
    }
    drawLabel(ctx, "断面（青: 湿り、白: 氷）", 4, 12, "rgba(255,255,255,0.8)");

    // ---- 右上: 地上から見た空
    const rx = lw + 6;
    const rw = w - rx;
    const sh = Math.floor(h * 0.58);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, 0, rw, sh);
    ctx.clip();
    const veil = 1 - Math.exp(-tau / MU0);
    const sky = ctx.createLinearGradient(0, 0, 0, sh);
    const mix = (a: number[], b: number[], t: number) =>
      a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",");
    sky.addColorStop(0, `rgb(${mix([20, 80, 170], [170, 180, 195], veil)})`);
    sky.addColorStop(1, `rgb(${mix([95, 160, 230], [200, 205, 212], veil)})`);
    ctx.fillStyle = sky;
    ctx.fillRect(rx, 0, rw, sh);
    const cx = rx + rw / 2;
    const cy = sh / 2;
    // 視野の半幅を 32° とする
    const pxPerDeg = Math.min(rw, sh) / 2 / 32;
    // 太陽（直達光 e^{-τ/μ0}）。厚くなると円盤がぼやける
    const direct = Math.exp(-tau / MU0);
    const sunR = Math.max(3, 0.27 * pxPerDeg * 2);
    const blur = sunR * (1 + 6 * veil);
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, blur * 2.5);
    sg.addColorStop(0, `rgba(255,255,240,${(0.25 + 0.75 * direct).toFixed(3)})`);
    sg.addColorStop(
      Math.min(0.9, sunR / (blur * 2.5)),
      `rgba(255,250,220,${(0.9 * direct + 0.1).toFixed(3)})`
    );
    sg.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, blur * 2.5, 0, Math.PI * 2);
    ctx.fill();
    // 22° ハロ（単散乱の明るさ ∝ τ e^{-τ/μ0}）
    const haloI = Math.min(1, 2.2 * tau * Math.exp(-tau / MU0));
    if (haloI > 0.01) {
      const R = 22 * pxPerDeg;
      const lwHalo = Math.max(2, 1.6 * pxPerDeg);
      ctx.lineWidth = lwHalo;
      ctx.strokeStyle = `rgba(255,150,120,${(0.35 * haloI).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R - lwHalo * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(0.55 * haloI).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R + lwHalo * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    drawLabel(ctx, "地上から見た空（太陽のまわり ±32°）", rx + 4, 12, "rgba(255,255,255,0.9)");
    drawLabel(ctx, csStage(tau), rx + 4, sh - 6, "rgba(255,255,255,0.95)");

    // ---- 右下: τ の時間変化
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < s.hist.length; i += 2) pts.push([s.hist[i] / 3600, s.hist[i + 1]]);
    pts.push([s.t / 3600, tau]);
    const tMax = Math.max(1, s.t / 3600);
    drawPlot(
      ctx,
      { x: rx, y: sh + 4, w: rw, h: h - sh - 4 },
      [
        {
          points: [
            [0, 3],
            [tMax, 3],
          ],
          color: "rgba(255,255,255,0.35)",
          dash: [3, 3],
        },
        { points: pts, color: "#7dd3fc" },
      ],
      {
        title: `光学的厚さ τ（${formatDuration(s.t)}）`,
        xLabel: "時間",
        xRange: [0, tMax],
        yRange: [0, Math.max(4, tau * 1.1)],
      }
    );
  },
  readouts(s) {
    const tau = csOpticalDepth(s);
    const b = cloudBounds(s);
    return [
      { label: "光学的厚さ τ", value: tau.toFixed(2) },
      { label: "直達光の透過率", value: `${(Math.exp(-tau / MU0) * 100).toFixed(0)}%` },
      {
        label: "雲底〜雲頂",
        value: b ? `${(b[0] / 1000).toFixed(1)}〜${(b[1] / 1000).toFixed(1)} km` : "なし",
      },
      { label: "氷水量（鉛直積算）", value: `${(iceWaterPath(s) * 1000).toFixed(1)} g/m²` },
    ];
  },
  time: (s) => s.t,
});
