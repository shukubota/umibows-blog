// 乱層雲: 層状性の降水の 1 次元鉛直カラム。
// 弱い一様な上昇で凝結した雲水を、上空で生まれた雪片が落ちながら集めて育ち（併合で数が減る）、
// 0 ℃ 高度の下で融けて雨になる。粒の数・雪の質量・雨の質量を落下のフラックス形式で解き、
// レーダー反射因子 Z の鉛直分布（ブライトバンド）と地上の降水強度を出す。
import { defineSim, type Params } from "../types";
import { RD, RHO_W, T0, clamp, pressureAt, qsat } from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawSky, formatDuration, type Rect } from "../draw";

const r = String.raw;

export const NS_Z_MAX = 9000;
export const NS_DZ = 50;
export const NS_NZ = NS_Z_MAX / NS_DZ;
/** 雲底 [m]（この下は凝結も蒸発もしない） */
export const NS_CLOUD_BASE = 500;
const LAPSE = 0.0065; // 気温減率 [K/m]
const V_SNOW = 1.0; // 雪片の落下速度 [m/s]
const RHO_SNOW = 100; // 雪片のかさ密度 [kg/m^3]
const NUC_RATE = 5; // 氷晶の発生率 [個/(m^3 s)]（−5 ℃ より冷たい雲の中）
const AGG_K = 1.5e-7; // 併合の係数 [m^3/s]
const COLLECT_E = 0.5; // 雲水を集める効率
const MELT_COEF = 1 / 600; // 融解の速さ [1/(s K)]
const D_MIN = 5e-5; // 粒の等価直径の下限・上限 [m]
const D_MAX = 6e-3;
const N_TRACERS = 160;
const HISTORY_DT = 120;

export interface NimbostratusState {
  t: number;
  /** 各層の気温 [K]・空気の密度 [kg/m^3]（時間変化しない） */
  T: Float64Array;
  rho: Float64Array;
  /** 凝結率 C = ρ_b w (−dq_s/dz) [kg/(m^3 s)] */
  cond: Float64Array;
  /** 雲水 [kg/m^3]、雪の質量 [kg/m^3]、雨の質量 [kg/m^3]、粒の数 [1/m^3] */
  qc: Float64Array;
  ms: Float64Array;
  mr: Float64Array;
  n: Float64Array;
  /** 各層の落下速度 [m/s] */
  v: Float64Array;
  /** 地上の降水強度 [mm/h] と、凝結量の鉛直積分 [mm/h] */
  rain: number;
  condInt: number;
  history: [number, number][];
  nextHistory: number;
  tracerZ: Float64Array;
  tracerX: Float64Array;
  seed: number;
}

/** 等価直径（融けた水の球にしたときの直径）[m] */
function meltedDiameter(mass: number): number {
  return clamp(Math.cbrt((6 * mass) / (Math.PI * RHO_W)), D_MIN, D_MAX);
}

/** 雨粒の落下速度 [m/s]（Atlas et al. 1973 の近似式） */
export function rainSpeed(D: number): number {
  return Math.max(0.1, 9.65 - 10.3 * Math.exp(-600 * D));
}

export function cloudTop(p: Params): number {
  return Math.min(NS_CLOUD_BASE + p.thick * 1000, NS_Z_MAX - NS_DZ);
}

/** 層 i の粒 1 個の平均の性質（融けた割合 f、等価直径 D、実際の直径 Ds、落下速度 v） */
function particle(s: NimbostratusState, i: number) {
  const m = s.ms[i] + s.mr[i];
  const n = Math.max(s.n[i], 1e-6);
  const f = m > 0 ? s.mr[i] / m : 0;
  const D = meltedDiameter(m / n);
  const Ds = D * Math.cbrt(RHO_W / RHO_SNOW);
  const size = Ds * (1 - f) + D * f;
  const v = V_SNOW + (rainSpeed(D) - V_SNOW) * f * f;
  return { m, n, f, D, size, v };
}

/** 等価レーダー反射因子 [dBZ]（単一サイズの粒、誘電率の係数を融けた割合で混ぜる） */
export function reflectivityDbz(s: NimbostratusState, i: number): number {
  const q = particle(s, i);
  if (q.m < 1e-9) return -10;
  const K = (0.0021 + (0.93 - 0.0021) * q.f) / 0.93;
  const Dmm = q.size * 1000;
  const Z = s.n[i] * K * Math.pow(Dmm, 6);
  return Math.max(-10, 10 * Math.log10(Math.max(Z, 1e-3)));
}

export function freezingIndex(s: NimbostratusState): number {
  for (let i = 0; i < NS_NZ; i++) if (s.T[i] < T0) return i;
  return NS_NZ - 1;
}

function rnd(s: NimbostratusState): number {
  s.seed = (s.seed * 16807) % 2147483647;
  return s.seed / 2147483647;
}

export const nimbostratusSim = defineSim<NimbostratusState>({
  id: "nimbostratus",
  title: "雪が融けて雨になる層状性の降水とブライトバンド",
  description: [
    r`乱層雲の中の 1 本の鉛直な気柱（地上〜9 km、50 m ごと）です。雲底 0.5 km から雲頂まで空気は飽和していて、一様な上昇（空気の質量フラックス $\rho_b w$ を高さによらず一定とします）で冷え、飽和混合比の減り分 $C = \rho_b w(-dq_s/dz)$ だけ毎秒雲水ができます。気温は 0 ℃ 高度を通る一定の減率 6.5 K/km の分布で、時間変化させません。`,
    r`−5 ℃ より冷たい所で氷晶が一定の割合で生まれ、雪片として $1\,\mathrm{m\,s^{-1}}$ で落ちます。雪片は落ちながら雲水を掃き集めて重くなり（昇華成長とライミングをまとめて「掃引」で表します）、ぶつかってくっつくので数が減ります（併合）。0 ℃ 高度より下では、気温と 0 ℃ の差に比例する速さで融け、融けた割合が増えると落下速度が雨粒の値（数 $\mathrm{m\,s^{-1}}$）へ急に上がります。粒の数・雪の質量・雨の質量は、上から落ちてくるフラックスの差で増減します。`,
    r`中央のグラフはレーダー反射因子 $Z$ の鉛直分布です。融けかけの雪片は大きさが雪片のままで表面が水になるので強く光り、0 ℃ 高度のすぐ下に反射の強い帯（ブライトバンド）が出ます。右上は落下速度、右下は地上の降水強度の時間変化で、点線は凝結量の鉛直積分 $\int C\,dz$ です。定常になると両者は一致します。`,
    r`簡単にした点: 粒は各高さで 1 種類の大きさ（平均の質量）だけで表し、雲底より下の蒸発、融解による冷却、雨粒の分裂、雲水の落下は無視しています。雪片の落下速度は一定、融けかけの粒の誘電率と大きさは融けた割合で直線的に混ぜました。発生率・併合・掃引・融解の係数は、桁が合うように選んだ値です。`,
  ],
  equations: [
    {
      tex: r`C(z) = \rho_b\, w \left(-\frac{dq_s}{dz}\right),\qquad \frac{\partial q_c}{\partial t} = C - E\,\frac{\pi}{4}D^2 v\, n\, q_c`,
      caption:
        "凝結と、落ちてくる粒による雲水の掃き集め。$q_c$ は雲水量、$D$ は粒の直径、$v$ は落下速度、$n$ は粒の数密度、$E = 0.5$ は効率です。",
    },
    {
      tex: r`\frac{\partial n}{\partial t} = \frac{\partial (v n)}{\partial z} + S_n - K n^2,\qquad \frac{\partial M_s}{\partial t} = \frac{\partial (v M_s)}{\partial z} + A_s - \frac{T - T_0}{\tau}M_s,\qquad \frac{\partial M_r}{\partial t} = \frac{\partial (v M_r)}{\partial z} + A_r + \frac{T - T_0}{\tau}M_s`,
      caption:
        "粒の数 $n$、雪の質量 $M_s$、雨の質量 $M_r$ の式。第 1 項が落下（上から入る量と下へ出る量の差）、$S_n$ は氷晶の発生（−5 ℃ 以下）、$K n^2$ は併合（0 ℃ 以下）、$A_s, A_r$ は掃き集めた雲水（0 ℃ より上は雪、下は雨に入る）、最後の項は融解（$T > T_0$ のとき）です。",
    },
    {
      tex: r`v = v_s + \bigl(v_r(D) - v_s\bigr) f^2,\qquad v_r(D) = 9.65 - 10.3\,e^{-600 D}`,
      caption:
        "落下速度。$f = M_r/(M_s + M_r)$ は融けた割合、$v_s = 1\\,\\mathrm{m\\,s^{-1}}$ は雪片、$v_r$ は雨粒（$D$ は m 単位の等価直径）です。",
    },
    {
      tex: r`Z = n\,\frac{|K|^2(f)}{|K_w|^2}\,D_{\mathrm{eff}}^6,\qquad P = v\,(M_s + M_r)\big|_{z=0} \;\to\; \int C\,dz \quad(\text{定常})`,
      caption:
        "等価レーダー反射因子（$D_{\\mathrm{eff}}$ は雪片の大きさから融けた水滴の大きさへ $f$ で移る）と地上の降水強度 $P$。",
    },
  ],
  params: [
    {
      key: "w",
      label: "上昇流 w",
      min: 0.02,
      max: 0.5,
      step: 0.01,
      value: 0.1,
      unit: "m/s",
      digits: 2,
    },
    {
      key: "z0c",
      label: "0 ℃ 高度",
      min: 0.6,
      max: 3,
      step: 0.1,
      value: 2,
      unit: "km",
      digits: 1,
    },
    {
      key: "thick",
      label: "雲の厚さ",
      min: 4,
      max: 8,
      step: 0.25,
      value: 6,
      unit: "km",
      digits: 2,
    },
  ],
  timeScale: 180,
  maxDt: 4,
  aspect: 0.6,
  init(p) {
    const T = new Float64Array(NS_NZ);
    const rho = new Float64Array(NS_NZ);
    const cond = new Float64Array(NS_NZ);
    const z0c = p.z0c * 1000;
    const Ts = T0 + LAPSE * z0c;
    const temp = (z: number) => T0 + LAPSE * (z0c - z);
    const qs = (z: number) => qsat(temp(z), pressureAt(z, Ts, LAPSE));
    const top = cloudTop(p);
    const rhoB = pressureAt(NS_CLOUD_BASE, Ts, LAPSE) / (RD * temp(NS_CLOUD_BASE));
    let condInt = 0;
    for (let i = 0; i < NS_NZ; i++) {
      const zc = (i + 0.5) * NS_DZ;
      T[i] = temp(zc);
      rho[i] = pressureAt(zc, Ts, LAPSE) / (RD * T[i]);
      const zb = i * NS_DZ;
      const zt = zb + NS_DZ;
      if (zb >= NS_CLOUD_BASE && zt <= top) {
        // 層の上下の面の q_s の差で書くと、積分がちょうど ρ_b w (q_s(雲底) − q_s(雲頂)) になる
        cond[i] = (rhoB * p.w * (qs(zb) - qs(zt))) / NS_DZ;
        condInt += cond[i] * NS_DZ;
      }
    }
    const tracerZ = new Float64Array(N_TRACERS);
    const tracerX = new Float64Array(N_TRACERS);
    const s: NimbostratusState = {
      t: 0,
      T,
      rho,
      cond,
      qc: new Float64Array(NS_NZ),
      ms: new Float64Array(NS_NZ),
      mr: new Float64Array(NS_NZ),
      n: new Float64Array(NS_NZ),
      v: new Float64Array(NS_NZ).fill(V_SNOW),
      rain: 0,
      condInt: condInt * 3600,
      history: [[0, 0]],
      nextHistory: HISTORY_DT,
      tracerZ,
      tracerX,
      seed: 12345,
    };
    for (let k = 0; k < N_TRACERS; k++) {
      tracerZ[k] = rnd(s) * top;
      tracerX[k] = rnd(s);
    }
    return s;
  },
  step(s, p, dt) {
    const nz = NS_NZ;
    const { qc, ms, mr, n, v, T, cond } = s;
    // 1. 各層の粒の落下速度と、雲水の掃き集め率
    const sweep = new Float64Array(nz);
    for (let i = 0; i < nz; i++) {
      const q = particle(s, i);
      v[i] = q.v;
      sweep[i] = COLLECT_E * (Math.PI / 4) * q.size * q.size * q.v * n[i];
    }
    // 2. 落下（上流＝上の層から入るフラックス形式。数・雪・雨を同じ速さで運ぶ）
    const fluxN = new Float64Array(nz + 1);
    const fluxS = new Float64Array(nz + 1);
    const fluxR = new Float64Array(nz + 1);
    for (let i = 0; i < nz; i++) {
      // 層 i の下の面を通って下へ出るフラックス
      fluxN[i] = v[i] * n[i];
      fluxS[i] = v[i] * ms[i];
      fluxR[i] = v[i] * mr[i];
    }
    for (let i = 0; i < nz; i++) {
      const c = dt / NS_DZ;
      n[i] += c * (fluxN[i + 1] - fluxN[i]);
      ms[i] += c * (fluxS[i + 1] - fluxS[i]);
      mr[i] += c * (fluxR[i + 1] - fluxR[i]);
    }
    s.rain = (fluxS[0] + fluxR[0]) * 3600;
    // 3. 生成・掃引・併合・融解（各層で、指数関数で解いて負にならないようにする）
    for (let i = 0; i < nz; i++) {
      const warm = T[i] >= T0;
      if (!warm && T[i] < T0 - 5 && cond[i] > 0) n[i] += NUC_RATE * dt;
      if (!warm) n[i] = n[i] / (1 + AGG_K * n[i] * dt);
      // 雲水: dq/dt = C − k q を厳密に解き、減った分を粒に渡す
      const k = sweep[i];
      const q0 = qc[i];
      const q1 =
        k > 1e-12 ? cond[i] / k + (q0 - cond[i] / k) * Math.exp(-k * dt) : q0 + cond[i] * dt;
      const collected = Math.max(0, q0 + cond[i] * dt - q1);
      qc[i] = Math.max(0, q1);
      if (warm) mr[i] += collected;
      else ms[i] += collected;
      if (warm && ms[i] > 0) {
        const melted = ms[i] * (1 - Math.exp(-MELT_COEF * (T[i] - T0) * dt));
        ms[i] -= melted;
        mr[i] += melted;
      }
      if (n[i] < 0) n[i] = 0;
      if (ms[i] < 0) ms[i] = 0;
      if (mr[i] < 0) mr[i] = 0;
    }
    // 4. 見た目用の粒（各高さの落下速度で動かす）
    const top = cloudTop(p);
    for (let k = 0; k < N_TRACERS; k++) {
      const i = clamp(Math.floor(s.tracerZ[k] / NS_DZ), 0, nz - 1);
      s.tracerZ[k] -= v[i] * dt;
      if (s.tracerZ[k] < 0) {
        s.tracerZ[k] = top - rnd(s) * 1500;
        s.tracerX[k] = rnd(s);
      }
    }
    s.t += dt;
    if (s.t >= s.nextHistory) {
      s.nextHistory += HISTORY_DT;
      s.history.push([s.t / 3600, s.rain]);
      if (s.history.length > 400) s.history.splice(0, s.history.length - 400);
    }
  },
  draw(ctx, s, p, w, h) {
    const colW = Math.round(w * 0.36);
    const col: Rect = { x: 0, y: 0, w: colW, h };
    drawSky(ctx, { x: 0, y: 0, w, h }, "overcast");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(colW, 0, w - colW, h);
    const toY = (z: number) => h - (z / NS_Z_MAX) * h;
    const top = cloudTop(p);

    // 雲（雲水が多いほど白く）
    for (let i = 0; i < NS_NZ; i++) {
      if (s.cond[i] <= 0 && s.qc[i] <= 0) continue;
      const a = clamp(0.25 + s.qc[i] * 2000, 0.25, 0.75);
      ctx.fillStyle = `rgba(203,213,225,${a})`;
      ctx.fillRect(0, toY((i + 1) * NS_DZ), colW, (NS_DZ / NS_Z_MAX) * h + 0.5);
    }
    // 0 ℃ 高度
    const z0 = p.z0c * 1000;
    ctx.strokeStyle = "rgba(250,204,21,0.8)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, toY(z0));
    ctx.lineTo(w, toY(z0));
    ctx.stroke();
    ctx.setLineDash([]);
    drawHeightAxis(ctx, col, NS_Z_MAX, toY, 1);
    drawLabel(ctx, "0 ℃", colW - 4, toY(z0) - 3, "#fde047", "right");

    // 降水粒子（雪は白い点、雨は青い線）
    for (let k = 0; k < N_TRACERS; k++) {
      const z = s.tracerZ[k];
      const i = clamp(Math.floor(z / NS_DZ), 0, NS_NZ - 1);
      const m = s.ms[i] + s.mr[i];
      if (m < 2e-6) continue;
      const f = s.mr[i] / m;
      const X = 30 + s.tracerX[k] * (colW - 36);
      const Y = toY(z);
      if (f < 0.5) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(X, Y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(125,211,252,0.9)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(X, Y - 2 - s.v[i] * 1.5);
        ctx.stroke();
      }
    }
    drawLabel(
      ctx,
      `雲頂 ${(top / 1000).toFixed(1)} km`,
      colW - 4,
      toY(top) - 3,
      undefined,
      "right"
    );
    // 地面
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, h - 3, colW, 3);

    // 反射因子と落下速度の鉛直分布、地上の降水強度の時間変化
    const gx = colW + 4;
    const gw = w - gx - 4;
    const zw = Math.floor(gw * 0.5) - 2;
    const zPts: [number, number][] = [];
    const vPts: [number, number][] = [];
    for (let i = 0; i < NS_NZ; i++) {
      const z = ((i + 0.5) * NS_DZ) / 1000;
      zPts.push([reflectivityDbz(s, i), z]);
      vPts.push([s.v[i], z]);
    }
    drawPlot(ctx, { x: gx, y: 4, w: zw, h: h - 8 }, [{ points: zPts, color: "#f472b6" }], {
      title: "反射因子 Z [dBZ]",
      xRange: [-10, 50],
      yRange: [0, NS_Z_MAX / 1000],
      xLabel: "",
      yLabel: "km",
    });
    const rx = gx + zw + 4;
    const rw = gw - zw - 4;
    const half = Math.floor((h - 12) / 2);
    drawPlot(ctx, { x: rx, y: 4, w: rw, h: half }, [{ points: vPts, color: "#7dd3fc" }], {
      title: "落下速度 [m/s]",
      xRange: [0, 8],
      yRange: [0, NS_Z_MAX / 1000],
      yLabel: "km",
    });
    const tMax = Math.max(1, s.t / 3600);
    const rMax = Math.max(s.condInt, ...s.history.map((q) => q[1])) * 1.25 || 1;
    drawPlot(
      ctx,
      { x: rx, y: 8 + half, w: rw, h: h - 12 - half },
      [
        { points: s.history, color: "#38bdf8" },
        {
          points: [
            [0, s.condInt],
            [tMax, s.condInt],
          ],
          color: "#fbbf24",
          dash: [4, 3],
        },
      ],
      { title: "地上の雨 [mm/h]", xLabel: "時間", xRange: [0, tMax], yRange: [0, rMax] }
    );
    drawLabel(ctx, formatDuration(s.t), 6, 14, "rgba(255,255,255,0.8)");
  },
  readouts(s) {
    let best = -10;
    let zBest = 0;
    for (let i = 0; i < NS_NZ; i++) {
      const d = reflectivityDbz(s, i);
      if (d > best) {
        best = d;
        zBest = (i + 0.5) * NS_DZ;
      }
    }
    return [
      { label: "地上の降水強度", value: `${s.rain.toFixed(2)} mm/h` },
      { label: "凝結量の積分 ∫C dz", value: `${s.condInt.toFixed(2)} mm/h` },
      {
        label: "反射のいちばん強い高さ",
        value: best > 0 ? `${(zBest / 1000).toFixed(2)} km（${best.toFixed(0)} dBZ）` : "—",
      },
    ];
  },
  time: (s) => s.t,
});
