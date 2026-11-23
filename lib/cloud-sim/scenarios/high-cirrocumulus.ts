// 巻積雲: 風の速さが急に変わる薄い層のケルビン＝ヘルムホルツ不安定。
// 渦シートを周期境界の点渦（Krasny のぼかし δ 付き）に分けて RK4 で動かす。
// 密度の跳び（成層）は、界面の傾きが生む傾圧的な渦度で各点渦の循環を変えることで入れる（ブシネスク近似）。
import { defineSim } from "../types";
import type { Params } from "../types";
import { drawLabel, drawPlot, drawPuff, drawSky } from "../draw";
import { CP, G, pressureAt, qsat, RD, saturationAdjust } from "../thermo";

/** 計算する周期領域の幅 = 波長 [m] */
export const KH_WAVELENGTH = 600;
export const KH_K = (2 * Math.PI) / KH_WAVELENGTH;
/** 点渦の数 */
export const KH_N = 120;
/** Krasny のぼかし（cosh(kΔy) − cos(kΔx) + δ² の δ。無次元） */
export const KH_DELTA = 0.5;
/** 初期の変位の振幅 [m] */
const EPS0 = 4;
/** シア層の高さと、そこの気温・気圧（標準大気） */
const Z_LAYER = 8000;
const T_LAYER = 288.15 - 0.0065 * Z_LAYER;
const P_LAYER = pressureAt(Z_LAYER);

/**
 * ぼかし δ の周期渦シートの線形理論に出てくる量。a = 1 + δ²、s = √(a² − 1)、r = a − s。
 * 1/(a − cos θ) = (1/s)(1 + 2Σ rⁿ cos nθ) を使うと、波数 n の成長率は
 * σ_n² = n rⁿ [k²ΔU²(1 − rⁿ)/(4s) − g'k/2]（δ → 0 で鋭い界面の σ² = n²k²ΔU²/4 − g'nk/2）。
 */
export function krasnyFactors(delta: number): { r: number; s: number } {
  const a = 1 + delta * delta;
  const s = Math.sqrt(a * a - 1);
  return { r: a - s, s };
}
const KF = krasnyFactors(KH_DELTA);
/**
 * シア層の厚さ h。kh = s/2 に取る。すると、どの波数 n でも不安定になるのは Ri < (1 − rⁿ)/4 < 1/4 のときだけ
 * （Ri ≥ 1/4 ならすべての波が安定。マイルズ＝ハワードの必要条件と同じ形）。
 */
export const KH_LAYER = KF.s / (2 * KH_K);

/** 浮力の跳び g' [m/s²]。Ri = g'h/ΔU²（N² = g'/h、シア ΔU/h） */
export function khBuoyancyJump(dU: number, Ri: number): number {
  return (Ri * dU * dU) / KH_LAYER;
}

/** 波数 n の線形成長率 [1/s]（ぼかし δ、浮力の跳び g'）。安定なら 0 */
export function khGrowthRateMode(dU: number, gPrime: number, n = 1, delta = KH_DELTA): number {
  const { r, s } = krasnyFactors(delta);
  const rn = Math.pow(r, n);
  const k = KH_K;
  const s2 = n * rn * ((k * k * dU * dU * (1 - rn)) / (4 * s) - (gPrime * k) / 2);
  return s2 > 0 ? Math.sqrt(s2) : 0;
}

/** このシミュレーションの波（波数 1）の線形成長率 */
export function khGrowthRate(dU: number, Ri: number): number {
  return khGrowthRateMode(dU, khBuoyancyJump(dU, Ri));
}

export interface KHState {
  t: number;
  x: Float64Array;
  y: Float64Array;
  gam: Float64Array;
  /** ラグランジュ的なラベル（初めの x） */
  alpha: Float64Array;
  /** [時刻, ln(A/A0)] の記録 */
  hist: number[];
  amp0: number;
  /** 巻き上がりきって点渦の間隔が粗くなったら 1（それ以降は形を止める） */
  frozen: number;
  /** はじめの1つあたりの循環 */
  gam0: number;
}

function params(p: Params) {
  const dU = p.dU ?? 5;
  const Ri = p.Ri ?? 0.03;
  return {
    dU,
    Ri,
    rhi: (p.rhi ?? 97) / 100,
    gPrime: khBuoyancyJump(dU, Ri),
  };
}

/**
 * 巻き上がりが進んで、となりの点渦の間隔が波長の 1/8 を超えたか、循環がはじめの 4 倍を超えたか。
 * そこから先（シートが引き伸ばされて砕け、乱流になる段階）は点渦の列では表せないので計算を止める。
 */
export function khResolutionLost(s: KHState): boolean {
  const g0 = Math.abs(s.gam0);
  for (let j = 0; j < KH_N; j++) {
    const jn = (j + 1) % KH_N;
    const dx = s.x[jn] + (jn === 0 ? KH_WAVELENGTH : 0) - s.x[j];
    if (Math.hypot(dx, s.y[jn] - s.y[j]) > KH_WAVELENGTH / 8) return true;
    if (Math.abs(s.gam[j]) > 4 * g0) return true;
  }
  return false;
}

/** 波の振幅（山と谷の高さの差の半分）[m] */
export function khHalfHeight(s: KHState): number {
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = 0; j < KH_N; j++) {
    hi = Math.max(hi, s.y[j]);
    lo = Math.min(lo, s.y[j]);
  }
  return (hi - lo) / 2;
}

/** 波数 1 の成分の振幅（ラベル α についてのフーリエ係数） */
export function khAmplitude(s: KHState): number {
  return khAmplitudeOf(s.y, s.alpha);
}

function khAmplitudeOf(y: ArrayLike<number>, alpha: ArrayLike<number>): number {
  let re = 0;
  let im = 0;
  for (let j = 0; j < KH_N; j++) {
    re += y[j] * Math.cos(KH_K * alpha[j]);
    im += y[j] * Math.sin(KH_K * alpha[j]);
  }
  return (2 / KH_N) * Math.hypot(re, im);
}

/** 状態 [x(N), y(N), Γ(N)] の時間微分 */
function rhs(Y: number[], gPrime: number, delta: number): number[] {
  const N = KH_N;
  const out = new Array<number>(3 * N).fill(0);
  const c0 = 1 / (2 * KH_WAVELENGTH);
  const d2 = delta * delta;
  for (let i = 0; i < N; i++) {
    const xi = Y[i];
    const yi = Y[N + i];
    const gi = Y[2 * N + i];
    for (let j = i + 1; j < N; j++) {
      const dx = xi - Y[j];
      const ky = Math.max(-40, Math.min(40, KH_K * (yi - Y[N + j])));
      const e = Math.exp(ky);
      const sh = (e - 1 / e) / 2;
      const ch = (e + 1 / e) / 2;
      const kx = KH_K * dx;
      const den = ch - Math.cos(kx) + d2;
      const a = (c0 * sh) / den;
      const b = (c0 * Math.sin(kx)) / den;
      const gj = Y[2 * N + j];
      // i が j から受ける速度と、j が i から受ける速度（逆符号）
      out[i] -= gj * a;
      out[N + i] += gj * b;
      out[j] += gi * a;
      out[N + j] -= gi * b;
    }
  }
  // 傾圧的な渦度の生成: dΓ_j/dt = −g' (y_{j+1/2} − y_{j−1/2})
  for (let j = 0; j < N; j++) {
    const yp = Y[N + ((j + 1) % N)];
    const ym = Y[N + ((j - 1 + N) % N)];
    out[2 * N + j] = (-gPrime * (yp - ym)) / 2;
  }
  return out;
}

export function khStep(s: KHState, gPrime: number, dt: number, delta = KH_DELTA) {
  const N = KH_N;
  const Y = new Array<number>(3 * N);
  for (let j = 0; j < N; j++) {
    Y[j] = s.x[j];
    Y[N + j] = s.y[j];
    Y[2 * N + j] = s.gam[j];
  }
  const k1 = rhs(Y, gPrime, delta);
  const k2 = rhs(
    Y.map((v, i) => v + (dt / 2) * k1[i]),
    gPrime,
    delta
  );
  const k3 = rhs(
    Y.map((v, i) => v + (dt / 2) * k2[i]),
    gPrime,
    delta
  );
  const k4 = rhs(
    Y.map((v, i) => v + dt * k3[i]),
    gPrime,
    delta
  );
  for (let j = 0; j < N; j++) {
    const f = (i: number) => Y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    s.x[j] = f(j);
    s.y[j] = f(N + j);
    s.gam[j] = f(2 * N + j);
  }
}

/** シート上の空気塊を η だけ断熱的に持ち上げたときの氷水量 [kg/kg] */
export function khIceWater(eta: number, rhi: number): number {
  const qt = rhi * qsat(T_LAYER, P_LAYER, true);
  const T = T_LAYER - (G / CP) * eta;
  const p = P_LAYER * Math.exp((-G * eta) / (RD * T_LAYER));
  return saturationAdjust(T, qt, 0, p, true).ql;
}

export const cirrocumulusSim = defineSim<KHState>({
  id: "cirrocumulus",
  title: "シア層の巻き上がり（ケルビン＝ヘルムホルツ不安定）とさざ波の雲",
  description: [
    String.raw`高さ 8 km で、上の空気が $+\Delta U/2$、下の空気が $-\Delta U/2$ で動いている薄いシア層を、循環 $\Gamma_j$ をもつ 120 個の点渦の列（渦シート）で表しています。水平方向は周期的（波長 $\lambda = 600\ \mathrm{m}$）として、点渦の運動を4次のルンゲ＝クッタ法で解いています。点渦どうしが近づきすぎて計算が壊れないよう、Krasny のぼかし $\delta = 0.5$ を入れています。ぼかしは、シア層に厚みがあることの代わりにもなっています。巻き上がりが進んで点渦の間隔が波長の 1/8 を超えるか、循環がはじめの 4 倍を超えたら、それ以上は点渦の列で表せない（実際には砕けて乱流になる）ので、そこで計算を止めています。`,
    String.raw`成層（上が軽い）は、シートを境に浮力が $g'$ だけ跳ぶとして入れています。シートが傾くと傾圧的に渦度が生まれ、各点渦の循環 $\Gamma_j$ が変わります（ブシネスク近似）。シア層の厚さを $h$ とし、リチャードソン数を $Ri = N^2/(\Delta U/h)^2 = g'h/\Delta U^2$（$N^2 = g'/h$）で定めています。`,
    String.raw`この離散化したモデルを線形化すると、波数 $n$ の成長率は下の式のようになります（$\delta \to 0$ では、よく知られた $\sigma^2 = n^2k^2\Delta U^2/4 - g'nk/2$、成層がなければ $\sigma = k\Delta U/2$ になります）。$kh = s/2$（$h \approx 36\ \mathrm{m}$）と選ぶと、波数 $n$ の波が育つのは $Ri < (1-r^n)/4$ のときだけになります。つまり $Ri \ge 1/4$ ではどの波も育ちません。$Ri < 1/4$ は必要条件で、十分ではありません。この計算の波長 $600\ \mathrm{m}$ の波（$n=1$）は $Ri < 0.125$ でないと育たず、$0.125 \le Ri < 1/4$ で育ちうるのは、もっと短く成長の遅い波だけです。`,
    String.raw`正直に言うと、$h$ の選び方は「$Ri \ge 1/4$ で安定」というマイルズ＝ハワードの定理と形がそろうように決めたものです。本来の定理は連続な速度・密度分布に対するもので、鋭い界面とぼかしのモデルとは同じではありません。`,
    String.raw`雲は、シート上の空気塊が持ち上げられた高さ $\eta$ だけ乾燥断熱的に冷えるとして、氷に対して過飽和になったぶんを氷にしています（はじめの氷に対する相対湿度がパラメータ）。巻き上がった山の部分だけが飽和し、白い粒の列になります。周期領域を横に並べて描いています。`,
  ],
  equations: [
    {
      tex: String.raw`\frac{dx_j}{dt} = -\sum_{i\ne j}\frac{\Gamma_i}{2\lambda}\,\frac{\sinh k(y_j-y_i)}{\cosh k(y_j-y_i)-\cos k(x_j-x_i)+\delta^2}`,
      caption: String.raw`周期 $\lambda$（$k = 2\pi/\lambda$）で並ぶ点渦がつくる水平速度`,
    },
    {
      tex: String.raw`\frac{dy_j}{dt} = \sum_{i\ne j}\frac{\Gamma_i}{2\lambda}\,\frac{\sin k(x_j-x_i)}{\cosh k(y_j-y_i)-\cos k(x_j-x_i)+\delta^2}`,
      caption: "鉛直速度",
    },
    {
      tex: String.raw`\frac{d\Gamma_j}{dt} = -g'\,\frac{y_{j+1}-y_{j-1}}{2},\qquad g' = \frac{Ri\,\Delta U^2}{h},\qquad \Gamma_j(0) = -\frac{\Delta U\,\lambda}{N}`,
      caption: String.raw`傾圧的な渦度の生成（浮力の跳び $g'$）。はじめの循環の合計は $-\Delta U\lambda$`,
    },
    {
      tex: String.raw`\sigma_n^2 = n\,r^n\left[\frac{k^2\Delta U^2\,(1-r^n)}{4s} - \frac{g'k}{2}\right],\qquad a = 1+\delta^2,\ s = \sqrt{a^2-1},\ r = a - s`,
      caption: String.raw`このモデルの線形成長率（グラフの点線は $n = 1$）。$kh = s/2$ なら $\sigma_n > 0 \iff Ri < (1-r^n)/4$`,
    },
    {
      tex: String.raw`T = T_0 - \Gamma_d\,\eta,\qquad q_i = \max\!\bigl(0,\ q_t - q_{s,i}(T, p)\bigr)`,
      caption: String.raw`持ち上げられた高さ $\eta$ での氷水量（潜熱を含む飽和調節で計算）`,
    },
  ],
  params: [
    { key: "dU", label: "層の上下の風速差 ΔU", min: 1, max: 8, step: 0.5, value: 5, unit: "m/s" },
    {
      key: "Ri",
      label: "リチャードソン数 Ri",
      min: 0,
      max: 0.4,
      step: 0.01,
      value: 0.03,
      unit: "",
    },
    {
      key: "rhi",
      label: "氷に対する相対湿度（はじめ）",
      min: 80,
      max: 100,
      step: 1,
      value: 97,
      unit: "%",
    },
  ],
  timeScale: 12,
  maxDt: 1,
  duration: 900,
  aspect: 0.55,
  init(p) {
    const { dU } = params(p);
    const x = new Float64Array(KH_N);
    const y = new Float64Array(KH_N);
    const gam = new Float64Array(KH_N);
    const alpha = new Float64Array(KH_N);
    for (let j = 0; j < KH_N; j++) {
      const a = (j * KH_WAVELENGTH) / KH_N;
      alpha[j] = a;
      x[j] = a;
      y[j] = EPS0 * Math.sin(KH_K * a);
      gam[j] = (-dU * KH_WAVELENGTH) / KH_N;
    }
    return {
      t: 0,
      x,
      y,
      gam,
      alpha,
      hist: [0, 0],
      amp0: khAmplitudeOf(y, alpha),
      frozen: 0,
      gam0: gam[0],
    };
  },
  step(s, p, dt) {
    const { gPrime } = params(p);
    if (!s.frozen) {
      khStep(s, gPrime, dt);
      if (khResolutionLost(s)) s.frozen = 1;
    }
    const tPrev = s.t;
    s.t += dt;
    if (Math.floor(s.t / 5) !== Math.floor(tPrev / 5)) {
      s.hist.push(s.t, Math.log(Math.max(khHalfHeight(s), 1e-6) / s.amp0));
    }
  },
  draw(ctx, s, p, w, h) {
    const { dU, Ri, rhi } = params(p);
    drawSky(ctx, { x: 0, y: 0, w, h }, "day");
    const nWave = Math.max(2, Math.min(5, Math.round(w / 170)));
    const scale = w / (nWave * KH_WAVELENGTH);
    const cy = h * 0.45;
    const toY = (eta: number) => cy - eta * scale;

    // 高さの目盛り（シア層の中心 8 km）
    ctx.save();
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let eta = -400; eta <= 400; eta += 200) {
      const y = toY(eta);
      if (y < 0 || y > h) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${((Z_LAYER + eta) / 1000).toFixed(1)} km`, 3, y - 2);
    }
    ctx.restore();

    // 上下の風
    ctx.save();
    ctx.strokeStyle = "rgba(253,224,71,0.75)";
    ctx.fillStyle = "rgba(253,224,71,0.75)";
    const arrow = (y: number, dir: number) => {
      const x0 = w / 2 - (dir * Math.min(60, w * 0.12)) / 2;
      const x1 = w / 2 + (dir * Math.min(60, w * 0.12)) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 - dir * 6, y - 3);
      ctx.lineTo(x1 - dir * 6, y + 3);
      ctx.fill();
    };
    arrow(Math.max(14, toY(250)), 1);
    arrow(Math.min(h - 8, toY(-250)), -1);
    ctx.restore();
    drawLabel(
      ctx,
      "+ΔU/2",
      w / 2 - 38,
      Math.max(14, toY(250)) + 4,
      "rgba(253,224,71,0.9)",
      "right"
    );
    drawLabel(
      ctx,
      "−ΔU/2",
      w / 2 - 38,
      Math.min(h - 8, toY(-250)) + 4,
      "rgba(253,224,71,0.9)",
      "right"
    );

    const N = KH_N;
    const px = s.x;
    const py = s.y;

    // 雲（山の部分の氷）。点渦と、その中点で氷水量を一度だけ計算し、横に並べて描く
    const puffs: { x: number; y: number; r: number; a: number }[] = [];
    for (let j = 0; j < N; j++) {
      const jn = (j + 1) % N;
      const xn = px[jn] + (jn === 0 ? KH_WAVELENGTH : 0);
      for (const f of [0, 0.5]) {
        const yy = py[j] + (py[jn] - py[j]) * f;
        const qi = khIceWater(yy, rhi);
        if (qi <= 0) continue;
        puffs.push({
          x: px[j] + (xn - px[j]) * f,
          y: yy,
          r: Math.min(34, 8 + Math.sqrt(qi * 1e6) * 2.5) * Math.min(1, scale * 3),
          a: Math.min(0.75, 0.3 + qi * 1.5e4),
        });
      }
    }
    for (let rep = -1; rep <= nWave; rep++) {
      const off = rep * KH_WAVELENGTH;
      for (const pf of puffs) {
        const sx = (((pf.x % KH_WAVELENGTH) + KH_WAVELENGTH) % KH_WAVELENGTH) + off;
        const X = sx * scale;
        if (X < -40 || X > w + 40) continue;
        drawPuff(ctx, X, toY(pf.y), pf.r, pf.a);
      }
    }

    // 渦シート（界面）
    ctx.save();
    ctx.strokeStyle = "rgba(125,211,252,0.75)";
    ctx.lineWidth = 1.2;
    for (let rep = -1; rep <= nWave; rep++) {
      const off = rep * KH_WAVELENGTH;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const xx = j === N ? px[0] + KH_WAVELENGTH : px[j];
        const yy = j === N ? py[0] : py[j];
        const sx = (xx + off) * scale;
        if (j === 0) ctx.moveTo(sx, toY(yy));
        else ctx.lineTo(sx, toY(yy));
      }
      ctx.stroke();
    }
    ctx.restore();

    if (s.frozen)
      drawLabel(
        ctx,
        "巻き上がりきったので計算を止めました（この先は乱流）",
        6,
        h - 8,
        "rgba(255,255,255,0.9)"
      );

    // 振幅の成長のグラフ
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < s.hist.length; i += 2) pts.push([s.hist[i], s.hist[i + 1]]);
    const sigma = khGrowthRate(dU, Ri);
    const tEnd = Math.max(60, s.t);
    const pw = Math.min(190, w * 0.42);
    const ph = Math.min(100, h * 0.36);
    drawPlot(
      ctx,
      { x: w - pw - 4, y: h - ph - 4, w: pw, h: ph },
      [
        {
          points: [
            [0, 0],
            [tEnd, sigma * tEnd],
          ],
          color: "rgba(253,224,71,0.8)",
          dash: [4, 3],
        },
        { points: pts, color: "#7dd3fc" },
      ],
      { title: "ln(波の振幅 / はじめ)", xLabel: "s", xRange: [0, tEnd], yRange: [-1, 5] }
    );
  },
  readouts(s, p) {
    const { dU, Ri, rhi } = params(p);
    let qMax = 0;
    for (let j = 0; j < KH_N; j++) qMax = Math.max(qMax, khIceWater(s.y[j], rhi));
    const sigma = khGrowthRate(dU, Ri);
    return [
      {
        label: "リチャードソン数",
        value: `${Ri.toFixed(2)}${Ri < 0.25 ? "（< 1/4）" : "（≥ 1/4）"}`,
      },
      {
        label: "線形成長率 σ",
        value: sigma > 0 ? `${(sigma * 1000).toFixed(1)}×10⁻³ /s` : "0（育たない）",
      },
      { label: "波の振幅", value: `${khHalfHeight(s).toFixed(0)} m` },
      { label: "山の氷水量（最大）", value: `${(qMax * 1e3).toFixed(3)} g/kg` },
    ];
  },
  time: (s) => s.t,
});
