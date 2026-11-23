// 積雲: 日射で暖まった地面から次々に上がる熱気泡（サーマル）を、エントレインメント付きの
// 空気塊モデルで1つずつ時間積分する。環境は「混合層 + 雲層 + 逆転層 + 上空」。
import { defineSim, type Params } from "../types";
import { GAMMA_D, T0, lclHeight, qsat, seededRandom, type Vec } from "../thermo";
import { drawHeightAxis, drawLabel, drawPlot, drawPuff, drawSky } from "../draw";
import {
  buildSounding,
  envAt,
  liftProfile,
  makeParcel,
  stepParcel,
  type ParcelProfile,
  type Sounding,
} from "./vertical-parcel";

/** 地上の露点 [K]（固定） */
export const CU_TD = T0 + 15;
/** 朝の気温分布の地上の値 [K] と、雲層の気温減率 [K/m] */
const T_MORNING = T0 + 20;
const LAPSE_CLOUD = 7e-3;
const LAPSE_ABOVE = 6.5e-3;
const INV_DEPTH = 300;
const PS = 101300;
const Z_TOP = 12000;
/** 描画する範囲 */
const DOMAIN_X = 8000;
const VIEW_Z = 5000;
const QL_MAX = 3e-3; // 積雲では雨にならない程度。これを超えた分だけ抜く

export interface CumulusEnv {
  snd: Sounding;
  /** 混合層の高さ [m] */
  h: number;
  qs: number;
  zInv: number;
}

/**
 * 環境の気温分布。朝の分布（地上 20 ℃、7 K/km、逆転層、その上 6.5 K/km）に対し、
 * 地上の気温 Ts まで暖まった混合層（乾燥断熱・水蒸気一定）が下から食い込む。
 * 混合層の上端 h は、乾燥断熱線が朝の分布にぶつかる高さと、持ち上げ凝結高度の低い方。
 * h より上は、朝の分布を h での気温差だけ一様に暖めたもの（雲による加熱）とする。
 */
export function cumulusEnv(p: Params): CumulusEnv {
  const Ts = T0 + p.ts;
  const zInv = p.zinv * 1000;
  const dTinv = p.inv;
  const free = (z: number): number => {
    const tInv = T_MORNING - LAPSE_CLOUD * zInv;
    if (z < zInv) return T_MORNING - LAPSE_CLOUD * z;
    if (z < zInv + INV_DEPTH) return tInv + (dTinv * (z - zInv)) / INV_DEPTH;
    return tInv + dTinv - LAPSE_ABOVE * (z - zInv - INV_DEPTH);
  };
  const qs = qsat(CU_TD, PS);
  // 乾燥断熱線と朝の分布の交点
  let zCross = 0;
  while (zCross < Z_TOP && Ts - GAMMA_D * zCross > free(zCross)) zCross += 5;
  // 乾燥断熱で上げた空気が飽和する高さ（混合比 qs 一定）
  const pre = buildSounding(
    Z_TOP,
    50,
    PS,
    (z) => Ts - GAMMA_D * z,
    () => qs
  );
  let zSat = 0;
  while (zSat < Z_TOP && qsat(envAt(pre, zSat).T, envAt(pre, zSat).p) > qs) zSat += 5;
  const h = Math.min(zCross, zSat);
  const offset = Math.max(0, Ts - GAMMA_D * h - free(h));
  const temp = (z: number) => (z <= h ? Ts - GAMMA_D * z : free(z) + offset);
  const snd = buildSounding(Z_TOP, 25, PS, temp, (z, T, pr) => {
    if (z <= h) return Math.min(qs, qsat(T, pr));
    const rhCloud = 0.8;
    const rhAbove = 0.2;
    const f = Math.min(1, Math.max(0, (z - zInv) / INV_DEPTH));
    return (rhCloud + (rhAbove - rhCloud) * f) * qsat(T, pr);
  });
  return { snd, h, qs, zInv };
}

interface Thermal {
  x: number;
  y: Vec;
  ql: number;
  /** 飽和した高さ（まだなら −1） */
  zBase: number;
  zTop: number;
  /** 0: 上昇中, 1: 止まって消えていく雲 */
  phase: number;
  age: number;
  fade: number;
  size: number;
  B: number;
}

interface CuState {
  t: number;
  eps: number;
  env: CumulusEnv;
  thermals: Thermal[];
  nextRelease: number;
  rand: () => number;
  /** これまでにできた雲の雲底・雲頂の記録（テスト・表示用） */
  bases: number[];
  topMax: number;
  wMax: number;
  profile: ParcelProfile;
}

const DT_EXCESS = 0.8; // サーマルの地上での気温の余分 [K]（平均）

/** 高さ z0（混合層の中）から速さ w0 でサーマルを1つ出す */
function release(s: CuState, z0 = 0, w0 = 0.5) {
  const r = s.rand;
  const e = envAt(s.env.snd, z0);
  const dT = DT_EXCESS * (0.6 + 0.8 * r()) * Math.exp(-s.eps * z0); // 途中の高さなら取り込みで減った分
  s.thermals.push({
    x: 300 + r() * (DOMAIN_X * 0.66 - 300),
    y: makeParcel(z0, w0, e.T + dT, s.env.qs),
    ql: 0,
    zBase: -1,
    zTop: 0,
    phase: 0,
    age: 0,
    fade: 1,
    size: 0.8 + 0.5 * r(),
    B: 0,
  });
}

export const cumulusSim = defineSim<CuState>({
  id: "cumulus",
  title: "立ちのぼるサーマルと晴天積雲",
  description: [
    String.raw`日射で暖まった地面から、周りより少し（0.5〜1.1 K）暖かい空気の塊（サーマル）が次々に上がります。一つひとつを空気塊とみなし、浮力 $B$ と周りの空気の取り込み（エントレインメント率 $\varepsilon$）を入れた鉛直運動方程式を4次のルンゲ＝クッタ法で解いています。持ち上げ凝結高度に達すると凝結が始まり（飽和調節）、そこから上が雲になります。`,
    String.raw`周りの大気は、朝の気温分布（地上 20 ℃、雲層 7 K/km、逆転層、その上 6.5 K/km）に、地上の気温まで暖まった混合層（乾燥断熱・水蒸気量一定、露点 15 ℃）が下から食い込んだ形にしています。混合層のてっぺんが持ち上げ凝結高度に届かないうちは、サーマルは雲を作れません。`,
    String.raw`簡単にしている点: サーマルどうしの相互作用、雲が周りの大気を変えていく効果、氷の生成は入れていません。止まったサーマルの雲は、一定の時間（約10分）で薄れていくものとして描いています。雲の太さは見た目のためのものです。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dz}{dt} = w, \qquad \frac{dw}{dt} = B - \varepsilon\,|w|\,w, \qquad B = g\,\frac{T_{v,p} - T_{v,e}}{T_{v,e}}`,
      caption: String.raw`サーマルの鉛直運動。$\varepsilon$ は取り込み率 [1/m]、$T_v = T(1 + 0.61\,q_v - q_l)$ は雲水 $q_l$ の重さも含めた仮温度`,
    },
    {
      tex: String.raw`\frac{d s_l}{dt} = -\varepsilon\,|w|\,(s_l - s_e), \qquad \frac{d q_t}{dt} = -\varepsilon\,|w|\,(q_t - q_{v,e})`,
      caption: String.raw`取り込みで周りの空気に近づく。$s_l = c_p T + g z - L_v q_l$（液水静的エネルギー）と総水量 $q_t = q_v + q_l$ は、取り込みがなければ凝結しても変わらない`,
    },
    {
      tex: String.raw`q_t = q_s(T, p) + q_l, \qquad s_l = c_p T + g z - L_v q_l \quad (q_l > 0\ \text{のとき})`,
      caption: String.raw`飽和調節。過飽和にならないように $T$ と $q_l$ を決める。$q_s$ は飽和混合比`,
    },
  ],
  params: [
    {
      key: "ts",
      label: "地上の気温（日射による加熱）",
      min: 20,
      max: 34,
      step: 0.5,
      value: 28,
      unit: "℃",
    },
    { key: "zinv", label: "逆転層の高さ", min: 1, max: 4, step: 0.1, value: 2.6, unit: "km" },
    {
      key: "inv",
      label: "逆転層の強さ（気温の上がり幅）",
      min: 0,
      max: 6,
      step: 0.5,
      value: 4,
      unit: "K",
    },
    {
      key: "eps",
      label: "エントレインメント率 ε",
      min: 0,
      max: 3,
      step: 0.1,
      value: 1,
      unit: "/km",
    },
  ],
  timeScale: 30,
  maxDt: 2,
  aspect: 0.6,
  init(p) {
    const env = cumulusEnv(p);
    const e0 = envAt(env.snd, 0);
    const s: CuState = {
      t: 0,
      eps: p.eps / 1000,
      env,
      thermals: [],
      nextRelease: 0,
      rand: seededRandom(7),
      bases: [],
      topMax: 0,
      wMax: 0,
      profile: liftProfile(env.snd, 0, e0.T + DT_EXCESS, env.qs, p.eps / 1000, QL_MAX, 7000, 25),
    };
    // 始めからいくつかのサーマルが混合層の途中まで上がっているところから始める
    for (let i = 0; i < 5; i++) release(s, (0.15 + 0.13 * i) * env.h, 1.2);
    return s;
  },
  step(s, p, dt) {
    const eps = p.eps / 1000;
    s.t += dt;
    s.nextRelease -= dt;
    if (s.nextRelease <= 0 && s.thermals.filter((t) => t.phase === 0).length < 14) {
      release(s);
      s.nextRelease = 40 + 50 * s.rand();
    }
    let wNow = 0;
    for (const th of s.thermals) {
      th.age += dt;
      if (th.phase === 1) {
        th.fade *= Math.exp(-dt / 600);
        continue;
      }
      const r = stepParcel(s.env.snd, th.y, dt, eps, QL_MAX);
      th.y = r.y;
      th.ql = r.th.ql;
      th.B = r.th.B;
      const z = th.y[0];
      if (th.ql > 0 && th.zBase < 0) {
        th.zBase = z;
        s.bases.push(z);
        if (s.bases.length > 50) s.bases.shift();
      }
      if (th.zBase >= 0 && th.ql > 0) th.zTop = Math.max(th.zTop, z);
      wNow = Math.max(wNow, th.y[1]);
      // 下降しながら自分の釣り合いの高さ（B = 0）を通り過ぎたら、上昇は終わり
      const stopped = th.y[1] < 0 && th.B > 0;
      if (stopped || z < 0 || th.age > 3600) {
        if (th.zBase >= 0) {
          th.phase = 1;
          s.topMax = Math.max(s.topMax, th.zTop);
        } else th.fade = 0;
      }
    }
    s.wMax = wNow;
    s.thermals = s.thermals.filter((t) => t.fade > 0.03);
  },
  draw(ctx, s, p, w, h) {
    const ground = 18;
    const plotH = h - ground;
    const toY = (z: number) => plotH - (z / VIEW_Z) * plotH;
    const toX = (x: number) => (x / DOMAIN_X) * w;
    const pxPerM = plotH / VIEW_Z;
    drawSky(ctx, { x: 0, y: 0, w, h: plotH }, "day");
    // 地面
    ctx.fillStyle = "#3f6212";
    ctx.fillRect(0, plotH, w, ground);
    ctx.fillStyle = "rgba(251,191,36,0.35)";
    ctx.fillRect(0, plotH, w, 3);
    drawHeightAxis(ctx, { x: 0, y: 0, w, h: plotH }, VIEW_Z, toY, 1);
    // 逆転層と LCL
    const zInv = s.env.zInv;
    ctx.fillStyle = "rgba(251,146,60,0.12)";
    ctx.fillRect(0, toY(zInv + INV_DEPTH), w, toY(zInv) - toY(zInv + INV_DEPTH));
    drawLabel(ctx, "逆転層", 44, toY(zInv + INV_DEPTH) - 3, "rgba(253,186,116,0.9)");
    const lcl = lclHeight(T0 + p.ts, CU_TD);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.moveTo(0, toY(lcl));
    ctx.lineTo(w, toY(lcl));
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, "125(T−Td)", 44, toY(lcl) - 3, "rgba(255,255,255,0.7)");
    // 混合層の上端
    ctx.strokeStyle = "rgba(250,204,21,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, toY(s.env.h));
    ctx.lineTo(w, toY(s.env.h));
    ctx.stroke();

    for (const th of s.thermals) {
      const x = toX(th.x);
      const z = th.y[0];
      if (th.phase === 0 && th.zBase < 0) {
        // まだ乾いているサーマル（暖かい空気の泡）
        const r = Math.max(4, 220 * th.size * pxPerM);
        drawPuff(ctx, x, toY(z), r, 0.28, "251,146,60");
        continue;
      }
      const base = th.zBase;
      const top = th.phase === 0 ? Math.max(z, base) : th.zTop;
      const depth = Math.max(top - base, 1);
      const width = (250 + 0.35 * depth) * th.size * pxPerM;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, toY(base));
      ctx.clip();
      // 見た目の雲頂が計算の雲頂に合うよう、いちばん上の塊の中心は半径の分だけ下げる
      const rTop = width * 0.5;
      const zHi = Math.max(base, top - (0.8 * rTop) / pxPerM);
      const n = Math.max(1, Math.ceil((zHi - base) / 110));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const zz = base + (zHi - base) * f;
        const taper = 1 - 0.45 * f;
        const offs = k === n ? [0] : [-0.6, 0, 0.6];
        for (const dx of offs) {
          const wob = Math.sin(th.x * 0.013 + k * 1.9 + dx * 3) * 0.18;
          const r = (k === n ? rTop : width * 0.58 * taper) * (1 + wob);
          drawPuff(ctx, x + (dx + wob) * width * taper, toY(zz), r, 0.78 * th.fade, "248,250,252");
        }
      }
      ctx.restore();
      // 平らな雲底のかげ
      ctx.fillStyle = `rgba(148,163,184,${0.5 * th.fade})`;
      ctx.fillRect(x - width * 1.05, toY(base) - 2, width * 2.1, 2);
    }

    // 気温の高度分布（右上の小グラフ）
    const pw = Math.min(160, w * 0.32);
    const ph = Math.min(120, plotH * 0.38);
    const prof = s.profile;
    const env: [number, number][] = [];
    const par: [number, number][] = [];
    for (let i = 0; i < prof.z.length; i += 8) {
      if (prof.z[i] > VIEW_Z) break;
      env.push([prof.Te[i] - T0, prof.z[i] / 1000]);
      par.push([prof.Tp[i] - T0, prof.z[i] / 1000]);
    }
    drawPlot(
      ctx,
      { x: w - pw - 4, y: 4, w: pw, h: ph },
      [
        { points: env, color: "#93c5fd", label: "周り" },
        { points: par, color: "#fb923c", label: "サーマル" },
      ],
      { title: "気温 [℃]（青: 周り / 橙: 空気塊）", yLabel: "km", yRange: [0, VIEW_Z / 1000] }
    );
  },
  readouts(s, p) {
    const base = s.bases.length ? s.bases.reduce((a, b) => a + b, 0) / s.bases.length : -1;
    let top = s.topMax;
    for (const th of s.thermals) if (th.zBase >= 0) top = Math.max(top, th.zTop);
    const lcl = lclHeight(T0 + p.ts, CU_TD);
    return [
      { label: "雲底（計算）", value: base >= 0 ? `${(base / 1000).toFixed(2)} km` : "雲なし" },
      { label: "125(T−Td)", value: `${(lcl / 1000).toFixed(2)} km` },
      { label: "雲頂", value: base >= 0 ? `${(top / 1000).toFixed(2)} km` : "—" },
      { label: "最大上昇速度", value: `${s.wMax.toFixed(1)} m/s` },
    ];
  },
  time: (s) => s.t,
});
