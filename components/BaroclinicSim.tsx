"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PARAMS,
  G,
  TwoLayerQG,
  betaAt,
  contourSegments,
  derive,
  fastestDomainMode,
  growthCurve,
  mulberry32,
  type BaroclinicParams,
} from "../lib/baroclinic";

type View = "ir" | "temp" | "w";

const VIEW_LABEL: Record<View, string> = {
  ir: "疑似赤外画像",
  temp: "中層の気温",
  w: "鉛直流 w",
};

const GRID = { nx: 128, ny: 64, Lx: 16_000e3, Ly: 8_000e3 };

/** 線形理論で使う南北の幅（ジェットの全幅、水路の幅が上限） */
function zoneWidth(p: BaroclinicParams): number {
  return Math.min(GRID.Ly, 2 * p.jetWidth);
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{props.label}</span>
        <span className="font-mono text-sky-300">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
      />
    </label>
  );
}

/** 下層雲の「セル」模様（ボロノイの縁が明るい＝開いたセル）。細かい格子と同じ大きさ。 */
function makeCellTexture(w: number, h: number, cell: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const gx = Math.ceil(w / cell);
  const gy = Math.ceil(h / cell) + 1;
  const pts: number[] = [];
  for (let j = 0; j < gy; j++)
    for (let i = 0; i < gx; i++) pts.push((i + rand()) * cell, (j + rand()) * cell);
  const tex = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      let d1 = Infinity;
      let d2 = Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj;
        if (jj < 0 || jj >= gy) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = (((ci + di) % gx) + gx) % gx;
          const px = pts[2 * (jj * gx + ii)] + (ci + di - ii) * cell;
          const py = pts[2 * (jj * gx + ii) + 1];
          const d = Math.hypot(x - px, y - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      // 縁（d2 − d1 が小さい）ほど明るく、セルの中心は薄く
      const edge = Math.max(0, 1 - (d2 - d1) / (0.45 * cell));
      tex[y * w + x] = 0.35 + 0.65 * edge;
    }
  }
  return tex;
}

function tempColor(t: number): [number, number, number] {
  // −50 ℃（紫）〜 +10 ℃（赤）
  const s = Math.max(0, Math.min(1, (t + 50) / 60));
  const stops: [number, number, number, number][] = [
    [0, 76, 29, 149],
    [0.25, 37, 99, 235],
    [0.5, 125, 211, 252],
    [0.7, 253, 224, 71],
    [0.85, 249, 115, 22],
    [1, 185, 28, 28],
  ];
  for (let k = 1; k < stops.length; k++) {
    if (s <= stops[k][0]) {
      const [s0, r0, g0, b0] = stops[k - 1];
      const [s1, r1, g1, b1] = stops[k];
      const f = (s - s0) / (s1 - s0);
      return [r0 + f * (r1 - r0), g0 + f * (g1 - g0), b0 + f * (b1 - b0)];
    }
  }
  return [185, 28, 28];
}

interface Sample {
  day: number;
  rms: number;
}

export default function BaroclinicSim() {
  const [shear, setShear] = useState(DEFAULT_PARAMS.shear);
  const [N, setN] = useState(DEFAULT_PARAMS.N);
  const [betaOn, setBetaOn] = useState(true);
  const [jetKm, setJetKm] = useState(DEFAULT_PARAMS.jetWidth / 1e3);
  const [dragDays, setDragDays] = useState(Math.round(1 / DEFAULT_PARAMS.drag / 86400));
  const [speed, setSpeed] = useState(1); // 日 / 秒
  const [view, setView] = useState<View>("ir");
  const [contours, setContours] = useState(true);
  const [running, setRunning] = useState(true);
  const [seed, setSeed] = useState(1);
  const [status, setStatus] = useState({ day: 0, rms: 0, dt: 0 });

  const params: BaroclinicParams = useMemo(
    () => ({
      ...DEFAULT_PARAMS,
      shear,
      N,
      beta: betaOn ? betaAt(DEFAULT_PARAMS.latitude) : 0,
      jetWidth: jetKm * 1e3,
      drag: 1 / (dragDays * 86400),
    }),
    [shear, N, betaOn, dragDays, jetKm]
  );
  const derived = useMemo(() => derive(params, GRID.Ly, GRID.ny), [params]);
  // 線形理論はジェットの中心の風の差で見積もり、南北の幅はジェットの幅（2 × 半幅）とする
  const fastest = useMemo(() => fastestDomainMode(params, GRID.Lx, zoneWidth(params)), [params]);

  const modelRef = useRef<TwoLayerQG | null>(null);
  const historyRef = useRef<Sample[]>([]);
  const paramsRef = useRef(params);
  const settingsRef = useRef({ speed, view, contours, running });
  useEffect(() => {
    settingsRef.current = { speed, view, contours, running };
  });

  // モデルを作り直す（初期化ボタン）
  useEffect(() => {
    const m = new TwoLayerQG(paramsRef.current, GRID);
    m.seedRandom(seed, 1);
    modelRef.current = m;
    historyRef.current = [];
  }, [seed]);

  // パラメータ変更は走っているモデルにそのまま反映
  useEffect(() => {
    paramsRef.current = params;
    modelRef.current?.setParams(params);
  }, [params]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const off = document.createElement("canvas");
    let tex: Float32Array | null = null;
    let image: ImageData | null = null;
    let raf = 0;
    let last = performance.now();
    let lastStatus = 0;

    const loop = (now: number) => {
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const m = modelRef.current;
      const st = settingsRef.current;
      if (m) {
        if (st.running) {
          const target = m.t + realDt * st.speed * 86400;
          const t0 = performance.now();
          while (m.t < target && performance.now() - t0 < 18) m.step();
          // 前回の記録から3時間たったら記録
          const hist = historyRef.current;
          const day = m.t / 86400;
          if (hist.length === 0 || day - hist[hist.length - 1].day >= 0.125) {
            hist.push({ day, rms: Math.sqrt(2 * m.eddyKineticEnergy()) });
            if (hist.length > 1200) hist.splice(0, hist.length - 1200);
          }
        }
        if (!tex || tex.length !== m.cnx * m.cny) tex = makeCellTexture(m.cnx, m.cny, 5, 11);
        draw(canvas, off, m, st.view, st.contours, tex, (img) => (image = img), image);
        drawHistory(historyCanvasRef.current, historyRef.current, fastestRef.current.sigma);
        if (now - lastStatus > 250) {
          lastStatus = now;
          const h = historyRef.current;
          setStatus({ day: m.t / 86400, rms: h.length ? h[h.length - 1].rms : 0, dt: m.dt });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fastestRef = useRef(fastest);
  useEffect(() => {
    fastestRef.current = fastest;
  }, [fastest]);

  const curve = useMemo(() => {
    const lambdas = Array.from({ length: 120 }, (_, i) => 1000e3 + i * 100e3);
    return growthCurve(params, lambdas, Math.PI / zoneWidth(params));
  }, [params]);

  const criticalShear = params.beta / derived.F;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  view === v
                    ? "bg-sky-500/20 border-sky-400 text-sky-200"
                    : "border-white/15 text-gray-300 hover:bg-white/5"
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-300 ml-auto">
              <input
                type="checkbox"
                checked={contours}
                onChange={(e) => setContours(e.target.checked)}
                className="accent-yellow-300"
              />
              上空の等高線
            </label>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full aspect-[2/1] rounded-xl border border-white/10 bg-black"
          />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-400 font-mono">
            <span>
              {status.day.toFixed(1)} 日目　擾乱の風速 {status.rms.toFixed(1)} m/s　Δt{" "}
              {status.dt.toFixed(0)} s
            </span>
            <span>東西 16,000 km × 南北 8,000 km（東西は周期、南北は壁）</span>
          </div>
          <Legend view={view} />
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-semibold"
            >
              {running ? "一時停止" : "再開"}
            </button>
            <button
              onClick={() => setSeed((s) => s + 1)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
            >
              最初から（別の乱数）
            </button>
          </div>
          <Slider
            label="ジェット中心の上空と地上の風の差 U₁−U₂（＝南北の温度差）"
            value={shear}
            min={4}
            max={40}
            step={1}
            display={`${shear} m/s`}
            onChange={setShear}
          />
          <Slider
            label="ジェット（温度差の集中する帯）の半幅"
            value={jetKm}
            min={800}
            max={3000}
            step={100}
            display={`${jetKm} km`}
            onChange={setJetKm}
          />
          <Slider
            label="静的安定度 N"
            value={N}
            min={0.008}
            max={0.016}
            step={0.0005}
            display={`${(N * 1000).toFixed(1)}×10⁻³ /s`}
            onChange={setN}
          />
          <Slider
            label="地表摩擦の時間スケール 1/r"
            value={dragDays}
            min={1}
            max={10}
            step={0.5}
            display={`${dragDays} 日`}
            onChange={setDragDays}
          />
          <Slider
            label="再生速度"
            value={speed}
            min={0.25}
            max={3}
            step={0.25}
            display={`1秒で ${speed} 日`}
            onChange={setSpeed}
          />
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={betaOn}
              onChange={(e) => setBetaOn(e.target.checked)}
              className="accent-sky-400"
            />
            β 効果（北ほどコリオリ力が強い）
          </label>

          <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-xs space-y-1 font-mono text-gray-300">
            <div>
              変形半径 L<sub>d</sub> = {(derived.Ld / 1e3).toFixed(0)} km
            </div>
            <div>
              いちばん育つ波長 {(fastest.lambda / 1e3).toFixed(0)} km（東西波数 {fastest.n}）*
            </div>
            <div>
              e 倍になる時間{" "}
              {fastest.sigma > 0 ? `${(1 / fastest.sigma / 86400).toFixed(2)} 日` : "育たない"}
            </div>
            <div>波の東進速度 {fastest.sigma > 0 ? `${fastest.c.toFixed(1)} m/s` : "—"}</div>
            <div className={shear > criticalShear ? "text-gray-400" : "text-amber-300"}>
              臨界の風の差 β/F = {criticalShear.toFixed(1)} m/s
            </div>
            <div className="text-gray-500 font-sans pt-1">
              * 線形理論の値は、ジェット中心の風の差が幅 {(zoneWidth(params) / 1e3).toFixed(0)} km
              にわたって一様と見なした見積もり
            </div>
            <div>
              ジェット中心の温度勾配 {(derived.tempPerPsi * shear * 1e6).toFixed(1)} K / 1000 km
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <figure className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <figcaption className="text-sm text-gray-300 mb-2">
            擾乱の強さの時間変化（縦軸は対数）。点線は線形理論の成長率
          </figcaption>
          <canvas ref={historyCanvasRef} className="w-full h-48" />
        </figure>
        <figure className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <figcaption className="text-sm text-gray-300 mb-2">
            波長ごとの成長率（線形理論、ジェット中心の値）。点は東西 16,000 km に入る波
          </figcaption>
          <GrowthChart curve={curve} params={params} />
        </figure>
      </div>
    </div>
  );
}

function Legend({ view }: { view: View }) {
  if (view === "ir")
    return (
      <p className="text-xs text-gray-400 leading-6">
        白いほど雲頂が冷たい（高い）。<span className="text-gray-100">白</span>
        ＝上昇域でできた背の高い雲（巻雲・巻層雲・高層雲・乱層雲）、
        <span className="text-gray-300">灰色のつぶつぶ</span>
        ＝寒気が流れ込む所の低い雲（層積雲・積雲）、黒＝晴れた海面（南ほど暖かく黒い）。
        黄色の線は上空（上層）の等高線＝ジェット気流の流れ。
      </p>
    );
  if (view === "temp")
    return (
      <p className="text-xs text-gray-400 leading-6">
        2層の境（約500 hPa）の気温。南北の温度差を波が混ぜ、暖気が北へ、寒気が南へ舌のように伸びる。
      </p>
    );
  return (
    <p className="text-xs text-gray-400 leading-6">
      赤＝上昇、青＝下降（±5 cm/s で色が飽和）。熱の式 Db/Dt = −N²w から求めた中層の鉛直流。
    </p>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  off: HTMLCanvasElement,
  m: TwoLayerQG,
  view: View,
  contours: boolean,
  tex: Float32Array,
  keep: (img: ImageData) => void,
  prev: ImageData | null
) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { cnx, cny } = m;
  if (off.width !== cnx || off.height !== cny) {
    off.width = cnx;
    off.height = cny;
  }
  const octx = off.getContext("2d");
  if (!octx) return;
  const img =
    prev && prev.width === cnx && prev.height === cny ? prev : octx.createImageData(cnx, cny);
  keep(img);
  const data = img.data;
  const s = cnx / m.nx;
  const { psi1, tau } = m.fields();
  const T = view === "temp" ? m.temperatureField(tau, -20) : null;
  // 下層雲の模様は下層の風で流す
  const texShift = (m.d.U2 * m.t) / (m.dx / s);

  for (let j = 0; j < cny; j++) {
    const row = cny - 1 - j; // 画像は北が上
    const yc = (j + 0.5) / s;
    for (let i = 0; i < cnx; i++) {
      const k = j * cnx + i;
      const o = 4 * (row * cnx + i);
      const xc = (i + 0.5) / s;
      let r: number, g: number, b: number;
      if (view === "ir") {
        // 海面：北ほど冷たい＝少し明るい
        const sea = 18 + 50 * (j / cny);
        const ti = ((Math.floor(i - texShift) % cnx) + cnx) % cnx;
        const lo = m.lowCloud[k] * tex[j * cnx + ti];
        const hi = m.highCloud[k];
        let v = sea + (150 - sea) * Math.min(1, lo * 1.2);
        // 雲が厚いほど雲頂が高く冷たい＝白い
        const hiBright = 170 + 85 * hi;
        const a = Math.min(1, hi * 1.6);
        v = v * (1 - a) + hiBright * a;
        r = g = b = v;
      } else if (view === "temp" && T) {
        [r, g, b] = tempColor(m.sample(T, xc, yc));
      } else {
        const w = m.sample(m.w, xc, yc);
        const a = Math.max(-1, Math.min(1, w / 0.05));
        if (a > 0) {
          r = 20 + 230 * a;
          g = 20 + 60 * a;
          b = 30 + 40 * a;
        } else {
          r = 20 + 30 * -a;
          g = 20 + 110 * -a;
          b = 30 + 220 * -a;
        }
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, W, H);

  // 上空の等高線（500 hPa 付近の高度 Z = Z0 + f0 ψ1 / g、60 m ごと）
  if (contours) {
    const nx = m.nx;
    const ny = m.ny + 1;
    const z = new Float64Array(nx * ny);
    const f0g = m.d.f0 / G;
    for (let j = 0; j < ny; j++) {
      const y = j * m.dy - m.Ly / 2;
      for (let i = 0; i < nx; i++) {
        z[j * nx + i] = 5600 + f0g * (psi1[j * nx + i] - m.d.U1 * y);
      }
    }
    // 東西に周期なので1列足して継ぎ目もつなぐ
    const nx1 = nx + 1;
    const zw = new Float64Array(nx1 * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx1; i++) zw[j * nx1 + i] = z[j * nx + (i % nx)];
    }
    let zmin = Infinity;
    let zmax = -Infinity;
    for (const v of z) {
      zmin = Math.min(zmin, v);
      zmax = Math.max(zmax, v);
    }
    const step = 60;
    const sx = W / nx;
    const sy = H / (ny - 1);
    ctx.lineWidth = 1;
    for (let lv = Math.ceil(zmin / step) * step; lv <= zmax; lv += step) {
      const major = lv % 300 === 0;
      ctx.strokeStyle = major ? "rgba(250, 230, 80, 0.85)" : "rgba(250, 230, 80, 0.4)";
      ctx.lineWidth = major ? 1.4 : 0.8;
      const seg = contourSegments(zw, nx1, ny, lv);
      ctx.beginPath();
      for (let q = 0; q < seg.length; q += 4) {
        ctx.moveTo(seg[q] * sx, H - seg[q + 1] * sy);
        ctx.lineTo(seg[q + 2] * sx, H - seg[q + 3] * sy);
      }
      ctx.stroke();
    }
  }

  // 縮尺（1000 km）
  const px1000 = (W / m.Lx) * 1e6;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(W - px1000 - 24, H - 30, px1000 + 16, 22);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - px1000 - 16, H - 14);
  ctx.lineTo(W - 16, H - 14);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("1000 km", W - 16 - px1000 / 2, H - 17);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("北（寒）", 8, 16);
  ctx.fillText("南（暖）", 8, H - 10);
}

function drawHistory(canvas: HTMLCanvasElement | null, hist: Sample[], sigma: number) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const L = 40;
  const B = 22;
  const lo = -1; // 0.1 m/s
  const hi = 2; // 100 m/s
  const dayMax = Math.max(10, hist.length ? Math.ceil(hist[hist.length - 1].day / 10) * 10 : 10);
  const dayMin = hist.length ? Math.max(0, hist[0].day) : 0;
  const X = (d: number) => L + ((d - dayMin) / (dayMax - dayMin)) * (W - L - 8);
  const Y = (r: number) => H - B - ((Math.log10(Math.max(r, 1e-3)) - lo) / (hi - lo)) * (H - B - 8);
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "#9ca3af";
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (const r of [0.1, 1, 10, 100]) {
    ctx.beginPath();
    ctx.moveTo(L, Y(r));
    ctx.lineTo(W - 8, Y(r));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${r} m/s`, L - 4, Y(r) + 3);
  }
  ctx.textAlign = "center";
  const tickStep = dayMax - dayMin > 40 ? 10 : 5;
  for (let d = Math.ceil(dayMin / tickStep) * tickStep; d <= dayMax; d += tickStep) {
    ctx.fillText(`${d}日`, X(d), H - 6);
  }
  if (hist.length < 2) return;
  // 線形理論の傾き（振幅は e^{σt}）を、最初の点から引く
  if (sigma > 0) {
    const h0 = hist[0];
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
    ctx.beginPath();
    ctx.moveTo(X(h0.day), Y(h0.rms));
    const d1 = Math.min(dayMax, h0.day + Math.log(100 / h0.rms) / (sigma * 86400));
    ctx.lineTo(X(d1), Y(h0.rms * Math.exp(sigma * 86400 * (d1 - h0.day))));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  hist.forEach((h, i) => {
    if (i === 0) ctx.moveTo(X(h.day), Y(h.rms));
    else ctx.lineTo(X(h.day), Y(h.rms));
  });
  ctx.stroke();
}

function GrowthChart({
  curve,
  params,
}: {
  curve: { lambda: number; sigma: number }[];
  params: BaroclinicParams;
}) {
  const W = 480;
  const H = 200;
  const L = 44;
  const B = 26;
  const lamMax = 12_000e3;
  const sMax = Math.max(1, ...curve.map((c) => c.sigma * 86400)) * 1.1;
  const X = (lam: number) => L + (lam / lamMax) * (W - L - 10);
  const Y = (s: number) => H - B - (s / sMax) * (H - B - 10);
  const path = curve
    .map((c, i) => `${i ? "L" : "M"}${X(c.lambda).toFixed(1)},${Y(c.sigma * 86400).toFixed(1)}`)
    .join(" ");
  const modes = Array.from({ length: 16 }, (_, i) => i + 1)
    .map((n) => ({ n, lambda: GRID.Lx / n }))
    .filter((m) => m.lambda <= lamMax && m.lambda >= 1000e3)
    .map((m) => ({
      ...m,
      sigma: growthCurve(params, [m.lambda], Math.PI / zoneWidth(params))[0].sigma * 86400,
    }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="成長率">
      {[0, 0.5, 1, 1.5, 2, 2.5, 3]
        .filter((v) => v <= sMax)
        .map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 10} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={L - 4} y={Y(v) + 3} fontSize="10" fill="#9ca3af" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
      {[2000, 4000, 6000, 8000, 10000, 12000].map((km) => (
        <text key={km} x={X(km * 1e3)} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="middle">
          {km}
        </text>
      ))}
      <text x={W - 10} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="end" dy={-12}>
        波長 [km]
      </text>
      <text x={L + 4} y={14} fontSize="10" fill="#9ca3af">
        成長率 σ [1/日]
      </text>
      <path d={path} fill="none" stroke="#f472b6" strokeWidth={2} />
      {modes.map((m) => (
        <g key={m.n}>
          <circle cx={X(m.lambda)} cy={Y(m.sigma)} r={3.5} fill="#fbbf24" />
          {m.n <= 8 && (
            <text
              x={X(m.lambda)}
              y={Y(m.sigma) - 7}
              fontSize="9"
              fill="#fde68a"
              textAnchor="middle"
            >
              {m.n}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
