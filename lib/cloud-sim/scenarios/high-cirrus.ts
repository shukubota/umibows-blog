// 巻雲（尾流雲）: 発生セルで生まれた氷晶が拡散成長して落ち、風の鉛直シアでかぎ状に曲がり、
// 下の乾いた層で昇華して消える。多数の氷晶をラグランジュ的に追う。
import { defineSim } from "../types";
import type { Params } from "../types";
import { drawLabel, drawPlot, drawSky } from "../draw";
import { pressureAt, seededRandom } from "../thermo";
import { iceGrowthCoefficient } from "./high-ice";

// 高さ・水平の範囲 [m]。水平座標は発生セルと一緒に動く座標（セルが x = 0）
export const CIRRUS_Z_BOTTOM = 5500;
export const CIRRUS_Z_TOP = 10000;
const X_MIN = -45000;
const X_MAX = 5000;
/** 発生セル（氷過飽和の薄い層）の下端・上端と中心 */
export const CELL_BOTTOM = 8600;
export const CELL_TOP = 9400;
export const CELL_Z0 = 9000;
const CELL_HALF_WIDTH = 800;

/** 結晶の有効密度 [kg/m^3]（すき間の多い六角柱・砲弾集合を同じ質量の球に置き換えたときの密度） */
export const RHO_EFF = 200;
/** 終端速度 v_t = a D^b（D = 300 μm で 0.7 m/s） */
export const VT_B = 0.6;
export const VT_A = 0.7 / Math.pow(300e-6, VT_B);
/** 生まれたときの直径と、昇華して消えたとみなす直径 [m] */
const D_INIT = 10e-6;
const D_MIN = 4e-6;
/** 何秒ごとに1つ氷晶（の代表粒子）を生むか */
const SPAWN_DT = 10;
const MAX_PARTICLES = 1000;

// 環境の高度プロファイルを表にしておく（毎ステップ exp を呼ばない）
const TABLE_DZ = 10;
const TABLE_N = Math.floor((CIRRUS_Z_TOP + 500 - CIRRUS_Z_BOTTOM + 1000) / TABLE_DZ) + 1;
const TABLE_Z0 = CIRRUS_Z_BOTTOM - 1000;

export function cirrusTemperature(z: number): number {
  return 288.15 - 0.0065 * z;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** 氷に対する飽和比 S_i(z)。発生セルで S_top、その下 300 m で S_low に移り、セルより上はやや未飽和 */
export function cirrusSi(z: number, sTop: number, sLow: number): number {
  const below = sLow + (sTop - sLow) * smoothstep((z - (CELL_BOTTOM - 300)) / 300);
  return below + (0.9 - below) * smoothstep((z - CELL_TOP) / 200);
}

export interface CirrusState {
  t: number;
  x: Float64Array;
  z: Float64Array;
  /** 直径の2乗 [m^2]（dD²/dt が D によらないので、昇華して 0 に近づいても特異にならない） */
  D2: Float64Array;
  x0: Float64Array;
  alive: Uint8Array;
  next: number;
  spawnAcc: number;
  /** z ごとの dD²/dt = 8 (S_i − 1) / (ρ_e (F_k + F_d)) [m^2/s] */
  growth: Float64Array;
  /** これまでに昇華して消えた数と、消えた高さの合計（平均を出す） */
  sublimated: number;
  sublimatedZSum: number;
  /** 下端（z < 5.5 km）まで落ちきった数 */
  reachedBottom: number;
  rand: () => number;
}

function growthAt(s: CirrusState, z: number): number {
  const f = (z - TABLE_Z0) / TABLE_DZ;
  const i = Math.min(TABLE_N - 2, Math.max(0, Math.floor(f)));
  const a = Math.min(1, Math.max(0, f - i));
  return s.growth[i] * (1 - a) + s.growth[i + 1] * a;
}

export function terminalVelocity(D2: number): number {
  return VT_A * Math.pow(Math.max(D2, 0), VT_B / 2);
}

function params(p: Params) {
  return {
    shear: (p.shear ?? 4) / 1000, // [1/s]
    sTop: (p.rhiTop ?? 125) / 100,
    sLow: (p.rhiLow ?? 80) / 100,
  };
}

function spawn(s: CirrusState) {
  const i = s.next;
  s.next = (s.next + 1) % MAX_PARTICLES;
  const x = (s.rand() * 2 - 1) * CELL_HALF_WIDTH;
  s.x[i] = x;
  s.x0[i] = x;
  s.z[i] = CELL_Z0 + (s.rand() * 0.9 - 0.2) * (CELL_TOP - CELL_Z0);
  s.D2[i] = D_INIT * D_INIT;
  s.alive[i] = 1;
}

export const cirrusSim = defineSim<CirrusState>({
  id: "cirrus",
  title: "発生セルから落ちる氷晶と、かぎ状の尾（尾流雲）",
  description: [
    String.raw`高さ約 9 km の薄い層（発生セル）が氷に対して過飽和になっていて、そこで次々に小さな氷晶（直径 $10\ \mu\mathrm{m}$）が生まれるとします。氷晶ひとつひとつの位置 $(x, z)$ と直径 $D$ を、拡散成長の式・終端速度・風の鉛直シアで時間積分しています（4次のルンゲ＝クッタ法）。`,
    String.raw`水平座標は発生セルと一緒に動く座標です。下に落ちた結晶ほど遅い風の中に入るので後ろ（左）へ取り残され、尾がかぎ状に曲がります。下の層が氷に対して未飽和（$S_i<1$）だと結晶は昇華して小さくなり、尾は途中で消えます。`,
    String.raw`簡単にした点: 結晶は同じ質量の球（有効密度 $\rho_e = 200\ \mathrm{kg/m^3}$）とみなし、静電容量は $C = D/2$ としました。終端速度は $v_t = a D^{0.6}$（$D = 300\ \mu\mathrm{m}$ で $0.7\ \mathrm{m/s}$）で、気圧による違いや通風効果は入れていません。氷晶が水蒸気を取り込んでも周りの湿度は変わらないとし（環境は固定）、発生セルの中の上昇流や氷晶の発生のしくみ（均質凍結）そのものは解かず、一定の間隔で氷晶を置いています。気温は標準大気（$6.5\ \mathrm{K/km}$）です。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dm}{dt} = \frac{4\pi C\,(S_i - 1)}{F_k + F_d},\qquad F_k = \left(\frac{L_s}{R_v T}-1\right)\frac{L_s}{K T},\quad F_d = \frac{R_v T}{D_v\,e_{s,i}(T)}`,
      caption: String.raw`氷晶の拡散成長（$S_i<1$ なら昇華）。$K$ は空気の熱伝導率、$D_v$ は水蒸気の拡散係数、$e_{s,i}$ は氷の飽和水蒸気圧`,
    },
    {
      tex: String.raw`m = \frac{\pi}{6}\rho_e D^3,\quad C = \frac{D}{2}\ \Rightarrow\ \frac{d(D^2)}{dt} = \frac{8\,(S_i-1)}{\rho_e\,(F_k+F_d)}`,
      caption: String.raw`実際には直径の2乗 $D^2$ を積分しています`,
    },
    {
      tex: String.raw`\frac{dz}{dt} = -v_t = -a\,D^{b},\qquad \frac{dx}{dt} = u(z) - u(z_0) = S\,(z - z_0)`,
      caption: String.raw`落下と、発生セル（高さ $z_0$）と一緒に動く座標での水平の動き。$S = \partial u/\partial z$ は鉛直シア、$b = 0.6$`,
    },
  ],
  params: [
    { key: "shear", label: "風の鉛直シア", min: 0, max: 8, step: 0.5, value: 4, unit: "m/s/km" },
    {
      key: "rhiTop",
      label: "発生セルの氷に対する相対湿度",
      min: 100,
      max: 150,
      step: 1,
      value: 125,
      unit: "%",
    },
    {
      key: "rhiLow",
      label: "下層の氷に対する相対湿度",
      min: 40,
      max: 110,
      step: 1,
      value: 80,
      unit: "%",
    },
  ],
  timeScale: 150,
  maxDt: 10,
  aspect: 0.6,
  init(p) {
    const { sTop, sLow } = params(p);
    const growth = new Float64Array(TABLE_N);
    for (let i = 0; i < TABLE_N; i++) {
      const z = TABLE_Z0 + i * TABLE_DZ;
      const T = cirrusTemperature(z);
      const pr = pressureAt(z);
      growth[i] = (8 * (cirrusSi(z, sTop, sLow) - 1) * iceGrowthCoefficient(T, pr)) / RHO_EFF;
    }
    return {
      t: 0,
      x: new Float64Array(MAX_PARTICLES),
      z: new Float64Array(MAX_PARTICLES),
      D2: new Float64Array(MAX_PARTICLES),
      x0: new Float64Array(MAX_PARTICLES),
      alive: new Uint8Array(MAX_PARTICLES),
      next: 0,
      spawnAcc: SPAWN_DT,
      growth,
      sublimated: 0,
      sublimatedZSum: 0,
      reachedBottom: 0,
      rand: seededRandom(20261122),
    };
  },
  step(s, p, dt) {
    const { shear } = params(p);
    s.spawnAcc += dt;
    while (s.spawnAcc >= SPAWN_DT) {
      s.spawnAcc -= SPAWN_DT;
      spawn(s);
    }
    // (x, z, D²) の RK4。dx/dt と dz/dt は x によらない
    const rhs = (z: number, D2: number): [number, number, number] => [
      shear * (z - CELL_Z0),
      -terminalVelocity(D2),
      growthAt(s, z),
    ];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!s.alive[i]) continue;
      const z = s.z[i];
      const d = s.D2[i];
      const k1 = rhs(z, d);
      const k2 = rhs(z + (dt / 2) * k1[1], d + (dt / 2) * k1[2]);
      const k3 = rhs(z + (dt / 2) * k2[1], d + (dt / 2) * k2[2]);
      const k4 = rhs(z + dt * k3[1], d + dt * k3[2]);
      s.x[i] += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      s.z[i] += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      s.D2[i] = Math.max(0, d + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]));
      if (s.D2[i] <= D_MIN * D_MIN) {
        s.alive[i] = 0;
        s.sublimated++;
        s.sublimatedZSum += s.z[i];
      } else if (s.z[i] < CIRRUS_Z_BOTTOM) {
        s.alive[i] = 0;
        s.reachedBottom++;
      } else if (s.x[i] < X_MIN) {
        s.alive[i] = 0;
      }
    }
    s.t += dt;
  },
  draw(ctx, s, p, w, h) {
    const { sTop, sLow } = params(p);
    drawSky(ctx, { x: 0, y: 0, w, h }, "day");
    const padL = 36;
    const stripW = Math.min(64, w * 0.14); // 右端は風の矢印の欄
    const plotR = w - stripW;
    // 横の範囲は尾の長さに合わせて 5 km 刻みで広げる（発生セルは右寄り）
    let xMin = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) if (s.alive[i]) xMin = Math.min(xMin, s.x[i]);
    const span = Math.max(10000, Math.ceil((-xMin + 2000) / 5000) * 5000);
    const xLo = -span;
    const xHi = span * 0.12;
    const toX = (x: number) => padL + ((x - xLo) / (xHi - xLo)) * (plotR - padL);
    const toY = (z: number) => h - ((z - CIRRUS_Z_BOTTOM) / (CIRRUS_Z_TOP - CIRRUS_Z_BOTTOM)) * h;
    // 高さの目盛り
    ctx.save();
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let km = 6; km <= 10; km++) {
      const y = toY(km * 1000);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();
      ctx.fillText(`${km} km`, 3, y + 3);
    }
    // 発生セルの層
    ctx.fillStyle = "rgba(186,230,253,0.10)";
    ctx.fillRect(padL, toY(CELL_TOP), plotR - padL, toY(CELL_BOTTOM) - toY(CELL_TOP));
    // 横の目盛り（発生セルからの距離）
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const xStep = span > 25000 ? 10000 : 5000;
    for (let x = 0; x >= xLo; x -= xStep) ctx.fillText(`${x / 1000} km`, toX(x), h - 4);
    ctx.fillStyle = "rgba(2,6,23,0.35)";
    ctx.fillRect(plotR, 0, w - plotR, h);
    ctx.restore();
    drawLabel(ctx, "発生セル", toX(0), toY(CELL_TOP) - 4, "rgba(186,230,253,0.85)", "center");

    // 風（セルに対する相対風）の矢印
    const { shear } = params(p);
    ctx.save();
    ctx.strokeStyle = "rgba(253,224,71,0.7)";
    ctx.fillStyle = "rgba(253,224,71,0.7)";
    const ax = w - 6;
    const pxPerMs = (stripW - 14) / 16; // 16 m/s で欄いっぱい
    for (let z = 6000; z <= 9500; z += 700) {
      const u = shear * (z - CELL_Z0);
      const y = toY(z);
      const len = u * pxPerMs;
      if (Math.abs(len) < 2) continue;
      ctx.beginPath();
      ctx.moveTo(ax, y);
      ctx.lineTo(ax + len, y);
      ctx.stroke();
      const dir = Math.sign(len);
      ctx.beginPath();
      ctx.moveTo(ax + len, y);
      ctx.lineTo(ax + len - dir * 5, y - 3);
      ctx.lineTo(ax + len - dir * 5, y + 3);
      ctx.fill();
    }
    ctx.restore();

    // 氷晶。大きいほど白く大きく
    ctx.save();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!s.alive[i]) continue;
      const D = Math.sqrt(s.D2[i]);
      const r = Math.min(2.6, 0.6 + D * 6000);
      const a = Math.min(0.9, 0.25 + D * 2500);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(toX(s.x[i]), toY(s.z[i]), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 氷に対する相対湿度のプロファイル
    const pts: [number, number][] = [];
    for (let z = CIRRUS_Z_BOTTOM; z <= CIRRUS_Z_TOP; z += 100)
      pts.push([cirrusSi(z, sTop, sLow) * 100, z / 1000]);
    const pw = Math.min(140, w * 0.28);
    const ph = Math.min(100, h * 0.34);
    drawPlot(
      ctx,
      { x: padL + 4, y: 4, w: pw, h: ph },
      [
        { points: pts, color: "#7dd3fc" },
        {
          points: [
            [100, CIRRUS_Z_BOTTOM / 1000],
            [100, CIRRUS_Z_TOP / 1000],
          ],
          color: "rgba(255,255,255,0.4)",
          dash: [3, 3],
        },
      ],
      { title: "氷に対する相対湿度", xLabel: "%", xRange: [30, 155] }
    );
    drawLabel(ctx, "相対風", w - 4, 14, "rgba(253,224,71,0.85)", "right");
  },
  readouts(s) {
    let zMin = Infinity;
    let dMax = 0;
    let n = 0;
    let xAtBottom = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!s.alive[i]) continue;
      n++;
      if (s.z[i] < zMin) {
        zMin = s.z[i];
        xAtBottom = s.x[i];
      }
      dMax = Math.max(dMax, s.D2[i]);
    }
    const D = Math.sqrt(dMax);
    return [
      { label: "尾の下端", value: n ? `${(zMin / 1000).toFixed(2)} km` : "—" },
      {
        label: "尾の水平のずれ",
        value: n ? `${Math.max(0, -xAtBottom / 1000).toFixed(1)} km` : "—",
      },
      { label: "最大の結晶（直径）", value: n ? `${(D * 1e6).toFixed(0)} μm` : "—" },
      { label: "その落下速度", value: n ? `${terminalVelocity(dMax).toFixed(2)} m/s` : "—" },
    ];
  },
  time: (s) => s.t,
});
