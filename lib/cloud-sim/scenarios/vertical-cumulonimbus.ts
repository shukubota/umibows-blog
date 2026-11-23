// 積乱雲: 条件付き不安定な深い大気の中を、地上から次々に送り込まれる空気塊を
// エントレインメント付きの空気塊モデル（vertical-parcel.ts）で積分する。
// 平衡高度（LNB）を越えて戻った空気塊はかなとことして横に流れ出し、
// 空気塊から抜けた雨水は降水粒子（雨・霰・雹）として終端速度で落とす。
import { defineSim, type Params } from "../types";
import { G, GAMMA_D, T0, clamp, qsat, seededRandom, type Vec } from "../thermo";
import { drawHeightAxis, drawLabel, drawPuff, drawSky } from "../draw";
import {
  buildSounding,
  envAt,
  liftProfile,
  makeParcel,
  rhoAir,
  stepParcel,
  type ParcelProfile,
  type Sounding,
} from "./vertical-parcel";

const PS = 100500;
export const CB_Z_TROP = 12000;
const Z_TOP = 20000;
const VIEW_Z = 17000;
const DOMAIN_X = 40000;
const X_CORE = 15000;
const R_CORE = 1500;
export const CB_QL_MAX = 2e-3; // 空気塊に残す雲水 [kg/kg]。超えた分は降水になる
export const CB_W0 = 2; // 送り出す速さ [m/s]
export const CB_DT_EXCESS = 0; // 地上の空気塊の気温の余分 [K]（周りと同じ空気を送り出す）
const U_TOP = 15; // 上空の風（圏界面で） [m/s]
const OUTFLOW = 8; // かなとこの流れ出しの速さ [m/s]
const RHO_ICE = 900;
const RHO_WATER = 1000;
const CD = 0.6;
const BIN = 250;
const NBIN = Math.ceil(Z_TOP / BIN);

export interface CbEnv {
  snd: Sounding;
  /** 混合層の上端（= 地上の空気の持ち上げ凝結高度） */
  h: number;
  qs: number;
  /** 0 ℃ の高さ */
  zFreeze: number;
}

/**
 * 地上から持ち上げ凝結高度までは乾燥断熱・水蒸気一定の混合層、その上は気温減率 Γ で
 * 圏界面（12 km）まで下がり、その上は等温の成層圏。湿度は混合層の上で 75 % から 10 km で 30 % へ。
 */
export function cumulonimbusEnv(p: Params): CbEnv {
  const Ts = T0 + p.ts;
  const qs = qsat(T0 + Math.min(p.td, p.ts), PS);
  const pre = buildSounding(
    Z_TOP,
    50,
    PS,
    (z) => Ts - GAMMA_D * z,
    () => qs
  );
  let h = 0;
  while (h < 6000 && qsat(envAt(pre, h).T, envAt(pre, h).p) > qs) h += 5;
  const lapse = p.lapse / 1000;
  const Th = Ts - GAMMA_D * h;
  const tTrop = Th - lapse * Math.max(0, CB_Z_TROP - h);
  const temp = (z: number) =>
    z <= h ? Ts - GAMMA_D * z : z <= CB_Z_TROP ? Th - lapse * (z - h) : tTrop;
  const snd = buildSounding(Z_TOP, 25, PS, temp, (z, T, pr) => {
    if (z <= h) return Math.min(qs, qsat(T, pr));
    if (z > CB_Z_TROP) return 0.1 * qsat(T, pr);
    const rh = 0.75 - 0.45 * clamp((z - h) / Math.max(10000 - h, 1), 0, 1);
    return rh * qsat(T, pr);
  });
  let zFreeze = 0;
  while (zFreeze < CB_Z_TROP && envAt(snd, zFreeze).T > T0) zFreeze += 25;
  return { snd, h, qs, zFreeze };
}

/** 地上から送り出す空気塊の持ち上げ分布（CAPE・CIN・LNB） */
export function cumulonimbusProfile(env: CbEnv, eps: number): ParcelProfile {
  const e0 = envAt(env.snd, 0);
  return liftProfile(env.snd, 0, e0.T + CB_DT_EXCESS, env.qs, eps, CB_QL_MAX, Z_TOP - 100, 20);
}

/** 球形の降水粒子の終端速度（重さと慣性抵抗の釣り合い） */
export function terminalVelocity(D: number, rhoP: number, rhoA: number): number {
  return Math.sqrt((4 * rhoP * G * D) / (3 * CD * rhoA));
}

interface Parcel {
  id: number;
  x: number;
  y: Vec;
  ql: number;
  B: number;
  zBase: number;
  zMax: number;
  wMax: number;
  rainAcc: number;
}

interface Particle {
  x: number;
  z: number;
  D: number;
  /** 1: 氷（霰・雹）, 0: 雨 */
  ice: number;
}

interface Remnant {
  x: number;
  z0: number;
  z1: number;
  /** かなとこの要素は横に流れる */
  u: number;
  anvil: number;
  age: number;
  fade: number;
}

interface CbState {
  t: number;
  env: CbEnv;
  profile: ParcelProfile;
  parcels: Parcel[];
  particles: Particle[];
  remnants: Remnant[];
  nextRelease: number;
  nextId: number;
  rand: () => number;
  /** 高さごとの上昇流と雲水（降水粒子が感じる場） */
  W: Float64Array;
  QL: Float64Array;
  /** 記録 */
  wMaxSeen: number;
  topSeen: number;
  hailMax: number;
  hailGround: number;
  /** 最初の空気塊の記録（テスト用） */
  first: { zMax: number; wMax: number; detrainZ: number };
}

function airW(s: CbState, x: number, z: number): number {
  const k = clamp(Math.floor(z / BIN), 0, NBIN - 1);
  const d = (x - X_CORE) / R_CORE;
  return d * d >= 1 ? 0 : s.W[k] * (1 - d * d);
}

function windU(z: number): number {
  return (U_TOP * clamp(z, 0, CB_Z_TROP)) / CB_Z_TROP - 3;
}

export const cumulonimbusSim = defineSim<CbState>({
  id: "cumulonimbus",
  title: "そびえ立つ積乱雲とかなとこ雲",
  description: [
    String.raw`地上の暖かく湿った空気を、上昇流の根元から 100 秒ごとに空気塊として送り出し（地面付近の収束で押し上げられることを表して、混合層の空気を初速 2 m/s で。混合層の中は浮力が 0 なので、混合層の上端＝雲底から出します）、積雲と同じエントレインメント付きの空気塊モデルを4次のルンゲ＝クッタ法で時間積分しています。周りの大気は、持ち上げ凝結高度までが混合層、その上が気温減率 $\Gamma$ で高さ 12 km の圏界面まで下がり、その上は等温の成層圏です。`,
    String.raw`空気塊は自由対流高度から浮力で加速し、平衡高度（LNB）を勢いで越えて（オーバーシュート）、押し戻されて釣り合いの高さを下向きに通り過ぎたところで、かなとことして横へ流れ出します。右下の図は高さごとの気温で、橙が取り込みのない空気塊、青が周りです（温度軸は高さとともに右へずらしています）。赤い面積が CAPE、青い面積が CIN です。`,
    String.raw`空気塊の雲水が 2 g/kg を超えた分は降水として抜き、粒子として落とします。粒子は終端速度で落ち、上昇流の中では押し上げられ、0 ℃ より上では過冷却の雲水を集めて霰・雹に育ちます。0 ℃ より下に落ちた 1 cm 未満の氷は雨に変わります。`,
    String.raw`簡単にしている点: 凍結の潜熱、気圧の乱れによる抵抗、雨の蒸発による冷たい下降流は入れていません。かなとこの横への広がりは「上空の風 + 一定の流れ出し速さ」で動かすだけで、流体として解いてはいません。上昇流の場は、最近通った空気塊の速さを高さごとに覚えたものです。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dz}{dt} = w, \qquad \frac{dw}{dt} = B - \varepsilon\,|w|\,w, \qquad B = g\,\frac{T_{v,p} - T_{v,e}}{T_{v,e}}`,
      caption: String.raw`空気塊の鉛直運動（雲水の重さは $T_v = T(1 + 0.61\,q_v - q_l)$ に含める）。$\varepsilon$ は取り込み率`,
    },
    {
      tex: String.raw`\frac{d s_l}{dt} = -\varepsilon\,|w|\,(s_l - s_e), \qquad \frac{d q_t}{dt} = -\varepsilon\,|w|\,(q_t - q_{v,e}), \qquad q_l > q_{l,\max} \Rightarrow \text{降水}`,
      caption: String.raw`取り込みと飽和調節（積雲と同じ）。$q_{l,\max} = 2$ g/kg を超えた雲水は降水として抜く`,
    },
    {
      tex: String.raw`\mathrm{CAPE} = \int_{z_{\mathrm{LFC}}}^{z_{\mathrm{LNB}}} B\,dz, \qquad \mathrm{CIN} = -\int_{0}^{z_{\mathrm{LFC}}} \min(B, 0)\,dz, \qquad w_{\max} = \sqrt{2\,\mathrm{CAPE}}`,
      caption: String.raw`取り込みのない空気塊を高さ方向に持ち上げて求める。$\varepsilon = 0$ のときの時間積分の最大上昇速度はほぼ $\sqrt{2\,\mathrm{CAPE}}$ になる`,
    },
    {
      tex: String.raw`\frac{dz_h}{dt} = w(z_h) - v_t, \qquad v_t = \sqrt{\frac{4\,\rho_h\,g\,D}{3\,C_D\,\rho_a}}, \qquad \frac{dD}{dt} = \frac{E\,v_t\,\rho_a\,q_l}{2\,\rho_h}`,
      caption: String.raw`降水粒子の落下と、過冷却の雲水を集めて育つ雹の直径 $D$。$C_D = 0.6$、捕捉率 $E = 0.8$、$\rho_h$ は粒子の密度（氷 900、水 1000 kg/m³）、$\rho_a$ は空気の密度`,
    },
  ],
  params: [
    { key: "ts", label: "地上の気温", min: 24, max: 36, step: 0.5, value: 32, unit: "℃" },
    { key: "td", label: "地上の露点", min: 8, max: 26, step: 0.5, value: 22, unit: "℃" },
    {
      key: "lapse",
      label: "上空の気温減率 Γ",
      min: 4.5,
      max: 7.5,
      step: 0.1,
      value: 6.2,
      unit: "K/km",
    },
    {
      key: "eps",
      label: "エントレインメント率 ε",
      min: 0,
      max: 0.6,
      step: 0.02,
      value: 0.1,
      unit: "/km",
    },
  ],
  timeScale: 60,
  maxDt: 2,
  duration: 5400,
  aspect: 0.6,
  init(p) {
    const env = cumulonimbusEnv(p);
    return {
      t: 0,
      env,
      profile: cumulonimbusProfile(env, 0),
      parcels: [],
      particles: [],
      remnants: [],
      nextRelease: 0,
      nextId: 0,
      rand: seededRandom(11),
      W: new Float64Array(NBIN),
      QL: new Float64Array(NBIN),
      wMaxSeen: 0,
      topSeen: 0,
      hailMax: 0,
      hailGround: 0,
      first: { zMax: 0, wMax: 0, detrainZ: -1 },
    };
  },
  step(s, p, dt) {
    const eps = p.eps / 1000;
    const snd = s.env.snd;
    s.t += dt;
    s.nextRelease -= dt;
    if (s.nextRelease <= 0 && s.parcels.length < 30) {
      // 混合層の中は浮力 0（中立）なので、混合層の空気を雲底（混合層の上端）から送り出す
      const zb = s.env.h;
      const e0 = envAt(snd, zb);
      s.parcels.push({
        id: s.nextId++,
        x: X_CORE + (s.rand() - 0.5) * 1200,
        y: makeParcel(zb, CB_W0, e0.T + CB_DT_EXCESS, s.env.qs),
        ql: 0,
        B: 0,
        zBase: -1,
        zMax: 0,
        wMax: CB_W0,
        rainAcc: 0,
      });
      s.nextRelease = 100;
    }
    // 上昇流・雲水の場はゆっくり忘れる
    const keep = Math.exp(-dt / 300);
    for (let k = 0; k < NBIN; k++) {
      s.W[k] *= keep;
      s.QL[k] *= keep;
    }
    const alive: Parcel[] = [];
    for (const pc of s.parcels) {
      const r = stepParcel(snd, pc.y, dt, eps, CB_QL_MAX);
      pc.y = r.y;
      pc.ql = r.th.ql;
      pc.B = r.th.B;
      const z = pc.y[0];
      const w = pc.y[1];
      if (pc.ql > 0 && pc.zBase < 0) pc.zBase = z;
      pc.zMax = Math.max(pc.zMax, z);
      pc.wMax = Math.max(pc.wMax, w);
      s.wMaxSeen = Math.max(s.wMaxSeen, w);
      if (pc.zBase >= 0) s.topSeen = Math.max(s.topSeen, z);
      if (pc.id === 0) {
        s.first.zMax = pc.zMax;
        s.first.wMax = pc.wMax;
      }
      const k = clamp(Math.floor(z / BIN), 0, NBIN - 1);
      if (w > 0) s.W[k] = Math.max(s.W[k], w);
      s.QL[k] = Math.max(s.QL[k], pc.ql);
      pc.rainAcc += r.rain;
      while (pc.rainAcc > 3e-4 && s.particles.length < 500) {
        pc.rainAcc -= 3e-4;
        s.particles.push({
          x: pc.x + (s.rand() - 0.5) * 2 * R_CORE * 0.8,
          z: z - s.rand() * 300,
          D: 0.001,
          ice: r.th.T < T0 ? 1 : 0,
        });
      }
      if (pc.rainAcc > 3e-4) pc.rainAcc = 0;
      // 下向きに自分の釣り合いの高さを通り過ぎたら、上昇は終わり
      const done = (w < 0 && pc.B > 0) || z < 0 || z > Z_TOP - 200;
      if (!done) {
        alive.push(pc);
        continue;
      }
      if (pc.id === 0) s.first.detrainZ = z;
      if (pc.zBase >= 0) {
        // 雲の柱の名残と、かなとこ（流れ出し）
        s.remnants.push({
          x: pc.x,
          z0: pc.zBase,
          z1: z,
          u: 0,
          anvil: 0,
          age: 0,
          fade: 1,
        });
        if (z > s.env.zFreeze + 2000) {
          for (const dir of [-1, 1]) {
            // かなとこの厚さは、釣り合いの高さから最高到達点まで
            s.remnants.push({ x: pc.x, z0: z, z1: pc.zMax, u: dir, anvil: 1, age: 0, fade: 1 });
          }
        }
      }
    }
    s.parcels = alive;
    for (const r of s.remnants) {
      r.age += dt;
      if (r.anvil) {
        r.x += (windU(r.z0) + r.u * OUTFLOW * Math.exp(-r.age / 1500)) * dt;
        r.fade = Math.exp(-r.age / 3600);
      } else {
        r.fade = Math.exp(-r.age / 400);
      }
    }
    s.remnants = s.remnants.filter((r) => r.fade > 0.05 && r.x > -5000 && r.x < DOMAIN_X + 5000);
    if (s.remnants.length > 400) s.remnants.splice(0, s.remnants.length - 400);
    // 降水粒子
    const keepP: Particle[] = [];
    for (const q of s.particles) {
      const env = envAt(snd, q.z);
      const rhoA = rhoAir(env);
      const rhoP = q.ice ? RHO_ICE : RHO_WATER;
      const vt = terminalVelocity(q.D, rhoP, rhoA);
      const wa = airW(s, q.x, q.z);
      q.z += (wa - vt) * dt;
      q.x += windU(q.z) * 0.5 * dt;
      const k = clamp(Math.floor(q.z / BIN), 0, NBIN - 1);
      const inCore = Math.abs(q.x - X_CORE) < R_CORE;
      if (q.ice && inCore && s.QL[k] > 0) {
        q.D += ((0.8 * vt * rhoA * s.QL[k]) / (2 * rhoP)) * dt;
        q.D = Math.min(q.D, 0.1);
      }
      if (!q.ice && q.D > 0.005) q.D = 0.005; // 大きな雨粒は分裂する
      if (q.ice && env.T > T0 && q.D < 0.01) q.ice = 0;
      if (q.ice) s.hailMax = Math.max(s.hailMax, q.D);
      if (q.z <= 0) {
        if (q.ice) s.hailGround = Math.max(s.hailGround, q.D);
        continue;
      }
      if (q.z > Z_TOP) continue;
      keepP.push(q);
    }
    s.particles = keepP;
  },
  draw(ctx, s, p, w, h) {
    const ground = 14;
    const plotH = h - ground;
    const toY = (z: number) => plotH - (z / VIEW_Z) * plotH;
    const toX = (x: number) => (x / DOMAIN_X) * w;
    const pz = plotH / VIEW_Z; // px / m（鉛直）
    const px = w / DOMAIN_X; // px / m（水平）
    drawSky(ctx, { x: 0, y: 0, w, h: plotH }, "day");
    // 成層圏を少し暗く
    ctx.fillStyle = "rgba(2,6,23,0.25)";
    ctx.fillRect(0, 0, w, toY(CB_Z_TROP));
    ctx.fillStyle = "#365314";
    ctx.fillRect(0, plotH, w, ground);
    drawHeightAxis(ctx, { x: 0, y: 0, w, h: plotH }, VIEW_Z, toY, 2);
    const hline = (z: number, color: string, label: string, dash: number[], right = false) => {
      ctx.save();
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, toY(z));
      ctx.lineTo(w, toY(z));
      ctx.stroke();
      ctx.restore();
      if (right) drawLabel(ctx, label, w - 6, toY(z) - 3, color, "right");
      else drawLabel(ctx, label, 44, toY(z) - 3, color);
    };
    hline(CB_Z_TROP, "rgba(196,181,253,0.7)", "圏界面", []);
    if (s.profile.zEL > 0)
      hline(s.profile.zEL, "rgba(252,165,165,0.8)", "平衡高度 LNB", [5, 4], true);
    hline(s.env.zFreeze, "rgba(125,211,252,0.6)", "0 ℃", [2, 4]);

    const cloudCol = (z: number) => (z > s.env.zFreeze + 3000 ? "226,232,240" : "248,250,252");
    // 雲は雲底より下には描かない
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, toY(s.env.h));
    ctx.clip();
    // 名残の雲の柱とかなとこ
    for (const r of s.remnants) {
      if (r.anvil) {
        const rx = 2500 * px * (1 + r.age / 1200);
        const ry = Math.max(3, Math.max(400, 0.5 * (r.z1 - r.z0)) * pz);
        ctx.save();
        ctx.translate(toX(r.x), toY(0.5 * (r.z0 + r.z1)));
        ctx.scale(rx / ry, 1);
        drawPuff(ctx, 0, 0, ry * 1.3, 0.45 * r.fade, "226,232,240");
        ctx.restore();
        continue;
      }
      const n = Math.max(2, Math.ceil((r.z1 - r.z0) / 600));
      for (let k = 0; k <= n; k++) {
        const zz = r.z0 + ((r.z1 - r.z0) * k) / n;
        drawPuff(ctx, toX(r.x), toY(zz), 1300 * px + 6, 0.35 * r.fade, cloudCol(zz));
      }
    }
    // 上昇中の空気塊がつくる塔
    for (const pc of s.parcels) {
      const z = pc.y[0];
      if (pc.zBase < 0) {
        drawPuff(ctx, toX(pc.x), toY(z), 5, 0.3, "251,146,60");
        continue;
      }
      const top = Math.max(z, pc.zBase);
      const n = Math.max(2, Math.ceil((top - pc.zBase) / 500));
      for (let k = 0; k <= n; k++) {
        const zz = pc.zBase + ((top - pc.zBase) * k) / n;
        drawPuff(ctx, toX(pc.x), toY(zz), 1500 * px + 7, 0.55, cloudCol(zz));
      }
      drawPuff(ctx, toX(pc.x), toY(top), 1900 * px + 8, 0.7, cloudCol(top));
    }
    ctx.restore();
    // 雲底のかげ
    if (s.parcels.some((q) => q.zBase >= 0) || s.remnants.some((r) => !r.anvil)) {
      ctx.fillStyle = "rgba(71,85,105,0.35)";
      ctx.fillRect(toX(X_CORE - 3000), toY(s.env.h) - 3, 6000 * px, 4);
    }
    // 降水粒子
    for (const q of s.particles) {
      const x = toX(q.x);
      const y = toY(q.z);
      if (q.ice) {
        const r = clamp(1 + q.D * 120, 1, 6);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(147,197,253,0.8)";
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 2);
        ctx.stroke();
      }
    }
    drawEmagram(ctx, s, w, plotH);
  },
  readouts(s) {
    const pr = s.profile;
    const wTheory = Math.sqrt(2 * pr.cape);
    return [
      {
        label: "CAPE / CIN",
        value: `${pr.cape.toFixed(0)} / ${pr.zLFC > 0 ? pr.cin.toFixed(0) : "—"} J/kg`,
      },
      {
        label: "最大上昇速度（√(2CAPE)）",
        value: `${s.wMaxSeen.toFixed(1)}（${wTheory.toFixed(1)}）m/s`,
      },
      {
        label: "雲頂 / LNB",
        value: `${(s.topSeen / 1000).toFixed(1)} / ${pr.zEL > 0 ? (pr.zEL / 1000).toFixed(1) : "—"} km`,
      },
      { label: "雹の最大直径", value: `${(s.hailMax * 1000).toFixed(1)} mm` },
    ];
  },
  time: (s) => s.t,
});

/** 右下の小さなエマグラム風の図（温度軸を高さとともに右へずらす） */
function drawEmagram(ctx: CanvasRenderingContext2D, s: CbState, w: number, plotH: number) {
  const pw = Math.min(190, w * 0.38);
  const ph = Math.min(150, plotH * 0.55);
  const x0 = w - pw - 4;
  const y0 = plotH - ph - 4;
  const pad = { l: 22, r: 4, t: 14, b: 12 };
  const ix = x0 + pad.l;
  const iy = y0 + pad.t;
  const iw = pw - pad.l - pad.r;
  const ih = ph - pad.t - pad.b;
  const zMax = 16000;
  const skew = 6; // K/km
  const xmin = -45;
  const xmax = 55;
  const sx = (T: number, z: number) =>
    ix + ((T - T0 + (skew * z) / 1000 - xmin) / (xmax - xmin)) * iw;
  const sy = (z: number) => iy + ih - (z / zMax) * ih;
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.75)";
  ctx.fillRect(x0, y0, pw, ph);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(ix, iy, iw, ih);
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("気温の高度分布（斜め温度軸）", x0 + 4, y0 + 11);
  ctx.textAlign = "right";
  ctx.fillText("16", ix - 2, iy + 8);
  ctx.fillText("0 km", ix - 2, iy + ih);
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  const pr = s.profile;
  const step = 10;
  // CAPE（赤）と CIN（青）の面積
  const zTopFill = pr.zEL > 0 ? pr.zEL : pr.zLCL > 0 ? pr.zLCL : 0;
  for (let i = 0; i + step < pr.z.length && pr.z[i] < Math.min(zTopFill, zMax); i += step) {
    const j = i + step;
    const pos = pr.B[i] + pr.B[j] > 0;
    if (!pos && pr.zLFC > 0 && pr.z[i] > pr.zLFC) continue;
    ctx.fillStyle = pos ? "rgba(248,113,113,0.5)" : "rgba(96,165,250,0.45)";
    ctx.beginPath();
    ctx.moveTo(sx(pr.Te[i], pr.z[i]), sy(pr.z[i]));
    ctx.lineTo(sx(pr.Tp[i], pr.z[i]), sy(pr.z[i]));
    ctx.lineTo(sx(pr.Tp[j], pr.z[j]), sy(pr.z[j]));
    ctx.lineTo(sx(pr.Te[j], pr.z[j]), sy(pr.z[j]));
    ctx.closePath();
    ctx.fill();
  }
  const line = (arr: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pr.z.length && pr.z[i] <= zMax; i += step) {
      const X = sx(arr[i], pr.z[i]);
      const Y = sy(pr.z[i]);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  };
  line(pr.Te, "#93c5fd");
  line(pr.Tp, "#fb923c");
  ctx.restore();
}
