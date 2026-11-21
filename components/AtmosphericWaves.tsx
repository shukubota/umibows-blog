"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  bruntVaisala,
  computeMountainWaves,
  coriolisParameter,
  inertialPosition,
  inertiaGravityFrequency,
  inertiaGravityGroupVelocity,
  liftToSaturate,
  scorer,
  trappedLeeWavelength,
  type MountainWaveParams,
  type WaveField,
} from "../lib/atmos-waves";

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void;

/** requestAnimationFrame で毎フレーム draw を呼ぶ canvas。DPR とリサイズに追従する。 */
function useAnimatedCanvas(draw: Draw) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<Draw>(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (ctx && w > 0 && h > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawRef.current(ctx, w, h, dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return canvasRef;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  accent?: string;
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
        className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer ${props.accent ?? "accent-sky-400"}`}
      />
    </label>
  );
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  width = 2
) {
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  const hx = x + dx;
  const hy = y + dy;
  const s = 7 + width;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - ux * s - uy * s * 0.5, hy - uy * s + ux * s * 0.5);
  ctx.lineTo(hx - ux * s + uy * s * 0.5, hy - uy * s - ux * s * 0.5);
  ctx.closePath();
  ctx.fill();
}

const Formula = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-sm bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-amber-200">
    {children}
  </div>
);

// ===================================================================================
// 慣性波（慣性振動）
// ===================================================================================

function InertialPanel() {
  const [lat, setLat] = useState(35);
  const [speed, setSpeed] = useState(10);
  const [hoursPerSec, setHoursPerSec] = useState(2);
  const [multi, setMulti] = useState(false);
  const simT = useRef(0);

  const f = coriolisParameter(lat);
  const period = Math.abs(f) > 1e-9 ? (2 * Math.PI) / Math.abs(f) : Infinity;
  const radius = Math.abs(f) > 1e-9 ? speed / Math.abs(f) : Infinity;

  useEffect(() => {
    simT.current = 0;
  }, [lat, speed, multi]);

  const canvasRef = useAnimatedCanvas((ctx, w, h, dt) => {
    simT.current += dt * hoursPerSec * 3600;
    const straightLimit = 8 * 3600;
    if (!isFinite(period) && simT.current > straightLimit) simT.current = 0;
    const t = simT.current;

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, w, h);

    const viewR = Math.min(radius, speed * straightLimit * 0.5);
    const scale = (0.44 * Math.min(w, h)) / (2 * viewR); // px / m
    const cx = w / 2;
    const cy = h / 2;
    const toS = (x: number, y: number) => [cx + x * scale, cy - y * scale] as const;

    // 格子（km）
    const stepKmCandidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    const stepKm =
      stepKmCandidates.find((s) => s * 1000 * scale > 60) ??
      stepKmCandidates[stepKmCandidates.length - 1];
    const stepPx = stepKm * 1000 * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let gx = cx % stepPx; gx < w; gx += stepPx) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = cy % stepPx; gy < h; gy += stepPx) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`格子 ${stepKm} km`, w - 12, h - 12);
    ctx.textAlign = "left";

    // 方位
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.fillText("北", cx, 18);
    ctx.fillText("南", cx, h - 8);
    ctx.textAlign = "left";
    ctx.fillText("東", w - 22, cy + 4);
    ctx.fillText("西", 8, cy + 4);

    const dirs = multi ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * Math.PI) / 4) : [0];
    const colors = [
      "#38bdf8",
      "#f472b6",
      "#a3e635",
      "#fbbf24",
      "#c084fc",
      "#34d399",
      "#fb7185",
      "#60a5fa",
    ];

    dirs.forEach((ang, i) => {
      const u0 = speed * Math.cos(ang);
      const v0 = speed * Math.sin(ang);
      const span = isFinite(period) ? period * 0.98 : straightLimit;
      const t0 = Math.max(0, t - span);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const n = 160;
      for (let s = 0; s <= n; s++) {
        const tt = t0 + ((t - t0) * s) / n;
        const p = inertialPosition(u0, v0, f, tt);
        const [sx, sy] = toS(p.x, p.y);
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const p = inertialPosition(u0, v0, f, t);
      const [sx, sy] = toS(p.x, p.y);
      // 速度（青）とコリオリ力（橙）
      const vs = 42 / speed;
      arrow(ctx, sx, sy, p.u * vs, -p.v * vs, "#e0f2fe", 2);
      if (Math.abs(f) > 1e-9) {
        const ax = f * p.v;
        const ay = -f * p.u;
        const as = 30 / (Math.abs(f) * speed);
        arrow(ctx, sx, sy, ax * as, -ay * as, "#fb923c", 2);
      }
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 出発点
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillText(`経過 ${(t / 3600).toFixed(1)} 時間`, 12, 22);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText("→ 速度", 12, 42);
    ctx.fillStyle = "#fb923c";
    ctx.fillText("→ コリオリ力", 12, 58);
  });

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <canvas
        ref={canvasRef}
        className="w-full h-[440px] sm:h-[560px] rounded-xl border border-white/10"
      />
      <div className="space-y-5">
        <div className="space-y-4 p-4 bg-gray-900/70 rounded-xl border border-white/10">
          <Slider
            label="緯度"
            value={lat}
            min={-80}
            max={80}
            step={1}
            display={`${lat >= 0 ? "北緯" : "南緯"} ${Math.abs(lat)}°`}
            onChange={setLat}
          />
          <Slider
            label="最初の風速"
            value={speed}
            min={1}
            max={30}
            step={1}
            display={`${speed} m/s`}
            onChange={setSpeed}
          />
          <Slider
            label="時間の速さ"
            value={hoursPerSec}
            min={0.25}
            max={8}
            step={0.25}
            display={`1 秒 = ${hoursPerSec} 時間`}
            onChange={setHoursPerSec}
          />
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={multi}
              onChange={(e) => setMulti(e.target.checked)}
              className="accent-sky-400"
            />
            8 方向に同時に放つ
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-black/40 rounded p-2">
              <div className="text-gray-500">f = 2Ω sinφ</div>
              <div className="text-sky-300">{f.toExponential(2)} /s</div>
            </div>
            <div className="bg-black/40 rounded p-2">
              <div className="text-gray-500">慣性周期 2π/|f|</div>
              <div className="text-sky-300">
                {isFinite(period) ? `${(period / 3600).toFixed(1)} 時間` : "∞（赤道）"}
              </div>
            </div>
            <div className="bg-black/40 rounded p-2 col-span-2">
              <div className="text-gray-500">円の半径 U/|f|</div>
              <div className="text-sky-300">
                {isFinite(radius) ? `${(radius / 1000).toFixed(0)} km` : "∞（まっすぐ進む）"}
              </div>
            </div>
          </div>
        </div>
      </div>
      <article className="lg:col-span-2 space-y-3 text-gray-300 leading-relaxed text-sm max-w-3xl">
        <h3 className="text-lg font-semibold text-white">しくみ：復元力がコリオリ力の波</h3>
        <p>
          回転している地球の上で動く空気には、進む向きに対して直角（北半球では右）にコリオリ力がはたらきます。
          気圧の差のような「押す力」がなく、一度だけ勢いをつけて放った空気塊は、このコリオリ力に曲げられ続けて円を描きます。これが
          <strong className="text-white">慣性振動</strong>です。
        </p>
        <Formula>du/dt = f v, dv/dt = −f u → 周期 2π/f = 12 時間 / sinφ</Formula>
        <p>
          コリオリ力は速さを変えずに向きだけを変えるので、円の速さは一定です。周期は緯度だけで決まり、
          北緯35度で約21時間、極に近づくほど12時間に近づき、赤道では無限大（曲がらない）になります。北半球では時計回り、南半球では反時計回りです。
        </p>
        <p>
          たくさんの空気塊がそろって円運動すると、回転する流体の中を伝わる
          <strong className="text-white">慣性波</strong>
          になります。海洋の表層流で周期 12/sinφ
          時間の揺れがよく観測されるほか、大気では夜間に地表の摩擦が弱まったときに
          風が強まる「下層ジェット」の原因になります。次の「重力波」タブで、波数ベクトルを鉛直に近づけると、重力波がこの慣性振動につながることも確かめられます。
        </p>
      </article>
    </div>
  );
}

// ===================================================================================
// 重力波（内部重力波・慣性重力波）
// ===================================================================================

function GravityPanel() {
  const [dThetaDz, setDThetaDz] = useState(3);
  const [alphaDeg, setAlphaDeg] = useState(40);
  const [rotation, setRotation] = useState(false);
  const [lat, setLat] = useState(35);
  const [timeScale, setTimeScale] = useState(2.5); // log10(シミュレーション秒 / 実時間秒)
  const simT = useRef(0);

  const N = bruntVaisala(290, dThetaDz);
  const f = rotation ? coriolisParameter(lat) : 0;
  const alpha = (alphaDeg * Math.PI) / 180;
  const omega = inertiaGravityFrequency(N, f, alpha);
  const speedFactor = Math.pow(10, timeScale);

  const canvasRef = useAnimatedCanvas((ctx, w, h, dt) => {
    simT.current += dt * speedFactor;
    const phase = omega * simT.current;

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, w, h);

    const lambdaPx = Math.max(160, Math.min(w, h) * 0.42);
    const K = (2 * Math.PI) / lambdaPx;
    const kx = K * Math.cos(alpha);
    const mz = K * Math.sin(alpha);
    const A = lambdaPx * 0.07;
    const ex = -Math.sin(alpha);
    const ez = Math.cos(alpha);
    const cy = h / 2;
    const disp = (x0: number, z0: number) => A * Math.cos(kx * x0 + mz * z0 - phase);

    // 等温位線（下ほど低温位＝重い、上ほど高温位＝軽い）
    const spacing = 22;
    const nLines = Math.ceil(h / spacing) + 4;
    for (let i = -2; i < nLines; i++) {
      const zs = h - i * spacing; // 画面座標
      const z0 = cy - zs;
      const tcol = i / nLines;
      const r = Math.round(80 + 170 * tcol);
      const b = Math.round(230 - 160 * tcol);
      ctx.strokeStyle = `rgba(${r},140,${b},0.55)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x0 = -20; x0 <= w + 20; x0 += 6) {
        const d = disp(x0, z0);
        const X = x0 + ex * d;
        const Y = cy - (z0 + ez * d);
        if (x0 === -20) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }

    // 空気塊
    const gap = 46;
    for (let gx = gap / 2; gx < w; gx += gap) {
      for (let gy = gap / 2; gy < h; gy += gap) {
        const z0 = cy - gy;
        const d = disp(gx, z0);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(gx + ex * d, cy - (z0 + ez * d), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 注目する空気塊と揺れる向き
    const focus = [
      [w * 0.25, cy - h * 0.2],
      [w * 0.5, cy],
      [w * 0.75, cy + h * 0.2],
    ];
    focus.forEach(([fx, fy]) => {
      const z0 = cy - fy;
      ctx.strokeStyle = "rgba(250,204,21,0.5)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fx - ex * A, cy - (z0 - ez * A));
      ctx.lineTo(fx + ex * A, cy - (z0 + ez * A));
      ctx.stroke();
      ctx.setLineDash([]);
      const d = disp(fx, z0);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(fx + ex * d, cy - (z0 + ez * d), 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 位相速度・群速度の向き
    const ax = w / 2;
    const ay = h / 2;
    const L = 70;
    arrow(ctx, ax, ay, Math.cos(alpha) * L, -Math.sin(alpha) * L, "#fde047", 3);
    const cg = inertiaGravityGroupVelocity(N, f, Math.cos(alpha), Math.sin(alpha));
    const cgl = Math.hypot(cg.cgx, cg.cgz);
    if (cgl > 0) arrow(ctx, ax, ay, (cg.cgx / cgl) * L, -(cg.cgz / cgl) * L, "#22d3ee", 3);

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(11,16,32,0.8)";
    ctx.fillRect(6, 6, 252, 70);
    ctx.fillStyle = "#fde047";
    ctx.fillText("→ 位相が進む向き（波数）", 12, 20);
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("→ エネルギーが進む向き（群速度）", 12, 36);
    ctx.fillStyle = "#facc15";
    ctx.fillText("● 空気塊（点線の向きに揺れる）", 12, 52);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("線 = 等温位線（上ほど温位が高い）", 12, 68);

    // 分散関係の小さなグラフ
    const pw = 190;
    const ph = 120;
    const px = w - pw - 12;
    const py = h - ph - 12;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(px, py, pw, ph);
    const gx0 = px + 30;
    const gy0 = py + ph - 22;
    const gw = pw - 42;
    const gh = ph - 40;
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * (Math.PI / 2);
      const o = N > 0 ? inertiaGravityFrequency(N, f, a) / N : 0;
      const X = gx0 + (i / 60) * gw;
      const Y = gy0 - o * gh;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    const cxp = gx0 + (alphaDeg / 90) * gw;
    const cyp = gy0 - (N > 0 ? omega / N : 0) * gh;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(cxp, cyp, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("ω/N", px + 4, py + 14);
    ctx.fillText("1", px + 18, gy0 - gh + 4);
    ctx.fillText("0", px + 18, gy0 + 4);
    ctx.fillText("α 0°", gx0 - 6, gy0 + 15);
    ctx.fillText("90°", gx0 + gw - 16, gy0 + 15);
  });

  const fmtPeriod = (w: number) => {
    if (w <= 0) return "—";
    const s = (2 * Math.PI) / w;
    return s < 3600 ? `${(s / 60).toFixed(1)} 分` : `${(s / 3600).toFixed(1)} 時間`;
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <canvas
        ref={canvasRef}
        className="w-full h-[440px] sm:h-[560px] rounded-xl border border-white/10"
      />
      <div className="space-y-4 p-4 bg-gray-900/70 rounded-xl border border-white/10 self-start">
        <Slider
          label="大気の安定度 dθ/dz"
          value={dThetaDz}
          min={0.5}
          max={10}
          step={0.5}
          display={`${dThetaDz} K/km`}
          onChange={setDThetaDz}
        />
        <Slider
          label="波数ベクトルの傾き α（水平から）"
          value={alphaDeg}
          min={0}
          max={90}
          step={1}
          display={`${alphaDeg}°`}
          onChange={setAlphaDeg}
        />
        <Slider
          label="時間の速さ"
          value={timeScale}
          min={1}
          max={4.5}
          step={0.1}
          display={`×${Math.round(speedFactor).toLocaleString()}`}
          onChange={setTimeScale}
        />
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={rotation}
            onChange={(e) => setRotation(e.target.checked)}
            className="accent-sky-400"
          />
          地球の自転を入れる（慣性重力波）
        </label>
        {rotation && (
          <Slider
            label="緯度"
            value={lat}
            min={5}
            max={80}
            step={1}
            display={`北緯 ${lat}°`}
            onChange={setLat}
          />
        )}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-black/40 rounded p-2">
            <div className="text-gray-500">浮力振動の周期 2π/N</div>
            <div className="text-sky-300">{fmtPeriod(N)}</div>
          </div>
          <div className="bg-black/40 rounded p-2">
            <div className="text-gray-500">この波の周期 2π/ω</div>
            <div className="text-sky-300">{fmtPeriod(omega)}</div>
          </div>
          <div className="bg-black/40 rounded p-2 col-span-2">
            <div className="text-gray-500">N</div>
            <div className="text-sky-300">{N.toExponential(2)} /s</div>
          </div>
        </div>
      </div>
      <article className="lg:col-span-2 space-y-3 text-gray-300 leading-relaxed text-sm max-w-3xl">
        <h3 className="text-lg font-semibold text-white">しくみ：復元力が浮力の波</h3>
        <p>
          ここでの重力波は、ブラックホールの「重力波」ではなく、
          <strong className="text-white">重力（浮力）が復元力になる大気の波</strong>です。
          上空ほど温位（空気を同じ気圧まで動かしたときの温度）が高い安定な大気では、空気塊を持ち上げると周りより重くなって沈み、
          押し下げると軽くなって浮きます。行き過ぎては戻るので、空気塊は振動します。その角振動数が浮力振動数
          N です。
        </p>
        <Formula>N² = (g/θ) dθ/dz → 典型的な対流圏で N ≈ 0.01 /s（周期 約10分）</Formula>
        <p>
          波の中の空気塊は、波の山や谷の線（位相線）に沿って斜めに揺れます。傾き α
          が大きいほど揺れが水平に近づき、浮力が効きにくくなるので、
          振動はゆっくりになります。地球の自転を入れると、水平に揺れる成分にコリオリ力が効くので、周期は慣性周期より長くはなりません。
        </p>
        <Formula>ω² = N² cos²α + f² sin²α</Formula>
        <p>
          不思議なのは、振動数が波長ではなく<strong className="text-white">向きだけ</strong>
          で決まることです。そのため、エネルギーが伝わる向き（群速度）は位相が進む向きと直交します。
          位相が斜め上へ進んで見えるとき、エネルギーは斜め下へ運ばれています。山で生まれた波が上空へエネルギーを運ぶとき、位相線は風上側へ傾き、波の山は下へ移動して見えます。
        </p>
      </article>
    </div>
  );
}

// ===================================================================================
// 筋雲（山岳波による波状雲）
// ===================================================================================

interface CloudParams extends MountainWaveParams {
  moistBottom: number;
  moistTop: number;
  dewpointDep: number;
}

const CLOUD_PRESETS: { name: string; desc: string; p: CloudParams }[] = [
  {
    name: "筋雲が並ぶ",
    desc: "下層が安定・上層が不安定に近く、波が下層に閉じ込められて風下に何本も並ぶ（捕捉風下波）",
    p: {
      U: 15,
      N1: 0.014,
      N2: 0.004,
      H: 3000,
      h0: 500,
      a: 2500,
      moistBottom: 2100,
      moistTop: 2600,
      dewpointDep: 1,
    },
  },
  {
    name: "上へ抜ける波",
    desc: "上空まで同じ安定度。波は斜め上へエネルギーを逃がし、風下に並ばない",
    p: {
      U: 15,
      N1: 0.01,
      N2: 0.01,
      H: 3000,
      h0: 500,
      a: 6000,
      moistBottom: 1800,
      moistTop: 3200,
      dewpointDep: 2,
    },
  },
  {
    name: "山の上だけ（笠雲）",
    desc: "湿った層が山頂付近だけにあり、持ち上げられる山の真上にだけ雲ができる",
    p: {
      U: 10,
      N1: 0.01,
      N2: 0.01,
      H: 2500,
      h0: 900,
      a: 3000,
      moistBottom: 600,
      moistTop: 1300,
      dewpointDep: 2,
    },
  },
];

const X_MIN = -30e3;
const X_MAX = 120e3;
const Z_TOP = 8000;
const NX = 240;
const NZ = 72;

function etaAt(field: WaveField, x: number, z: number): number {
  const { xs, zs, eta } = field;
  const nx = xs.length;
  const fx = ((x - xs[0]) / (xs[nx - 1] - xs[0])) * (nx - 1);
  const fz = ((z - zs[0]) / (zs[zs.length - 1] - zs[0])) * (zs.length - 1);
  const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(zs.length - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const a = eta[iz * nx + ix];
  const b = eta[iz * nx + ix + 1];
  const c = eta[(iz + 1) * nx + ix];
  const d = eta[(iz + 1) * nx + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

interface Particle {
  x: number;
  z0: number;
}

/** 乱数ではなく決まった並びにして、開くたびに同じ見た目にする */
function makeParticles(): Particle[] {
  return Array.from({ length: 180 }, (_, i) => ({
    x: X_MIN + (X_MAX - X_MIN) * ((i * 0.6180339887) % 1),
    z0: 200 + ((i * 37) % 180) * (7400 / 180),
  }));
}

function CloudPanel() {
  const [params, setParams] = useState<CloudParams>(CLOUD_PRESETS[0].p);
  const set = (patch: Partial<CloudParams>) => setParams((p) => ({ ...p, ...patch }));
  const deferred = useDeferredValue(params);

  const field = useMemo(() => {
    const xs = Float64Array.from(
      { length: NX },
      (_, i) => X_MIN + ((X_MAX - X_MIN) * i) / (NX - 1)
    );
    const zs = Float64Array.from({ length: NZ }, (_, i) => (Z_TOP * 1.15 * i) / (NZ - 1));
    return computeMountainWaves(deferred, xs, zs, { nk: 900 });
  }, [deferred]);

  const lift = liftToSaturate(deferred.dewpointDep);
  const lambda = trappedLeeWavelength(deferred);
  const l1 = scorer(deferred.N1, deferred.U);
  const l2 = scorer(deferred.N2, deferred.U);

  // 横方向の雲量（上から見た図用）
  const cover = useMemo(() => {
    const c = new Float32Array(NX);
    for (let ix = 0; ix < NX; ix++) {
      const x = field.xs[ix];
      let best = 0;
      for (let s = 0; s <= 8; s++) {
        const z0 = deferred.moistBottom + ((deferred.moistTop - deferred.moistBottom) * s) / 8;
        const e = etaAt(field, x, z0);
        best = Math.max(best, Math.min(1, (e - lift) / 200 + (e >= lift ? 0.35 : 0)));
      }
      c[ix] = Math.max(0, best);
    }
    return c;
  }, [field, deferred.moistBottom, deferred.moistTop, lift]);

  const particles = useRef<Particle[]>(makeParticles());

  const staticLayer = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);

  const canvasRef = useAnimatedCanvas((ctx, w, h, dt) => {
    const p = deferred;
    const secH = Math.round(h * 0.6);
    const topY = secH + 28;
    const topH = h - topY;
    const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * w;
    const sz = (z: number) => secH - (z / Z_TOP) * (secH - 8);
    const dpr = window.devicePixelRatio || 1;

    const isCloud = (x: number, z0: number) =>
      z0 >= p.moistBottom && z0 <= p.moistTop && etaAt(field, x, z0) >= lift;

    // 動かない部分（空・雲・山・流線・上から見た図）は条件が変わったときだけ描き直す
    const key = `${w}x${h}@${dpr}:${JSON.stringify(p)}`;
    if (!staticLayer.current || staticLayer.current.key !== key) {
      const off = document.createElement("canvas");
      off.width = Math.round(w * dpr);
      off.height = Math.round(h * dpr);
      const o = off.getContext("2d")!;
      o.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = o.createLinearGradient(0, 0, 0, secH);
      sky.addColorStop(0, "#0b1a3a");
      sky.addColorStop(1, "#2f5f8f");
      o.fillStyle = sky;
      o.fillRect(0, 0, w, secH);

      // 湿った層
      o.fillStyle = "rgba(125,211,252,0.07)";
      o.fillRect(0, sz(p.moistTop), w, sz(p.moistBottom) - sz(p.moistTop));

      // 雲：上流の高さ z0 = z − η が湿った層にあり、持ち上げ η が飽和に必要な高さを超えたところ
      // 格子1マス=1ピクセルの小さな画像に描いてから拡大し、縁をなめらかにする
      const nzv = field.zs.findIndex((z) => z > Z_TOP);
      const rows = nzv < 0 ? NZ : nzv;
      const cl = document.createElement("canvas");
      cl.width = NX;
      cl.height = rows;
      const clCtx = cl.getContext("2d")!;
      const cimg = clCtx.createImageData(NX, rows);
      const smooth = (v: number) => {
        const t = Math.max(0, Math.min(1, v));
        return t * t * (3 - 2 * t);
      };
      for (let iz = 0; iz < rows; iz++) {
        const z = field.zs[iz];
        for (let ix = 0; ix < NX; ix++) {
          const e = field.eta[iz * NX + ix];
          const z0 = z - e;
          const inLayer = smooth(Math.min(z0 - p.moistBottom, p.moistTop - z0) / 150);
          const a = 0.95 * smooth((e - lift) / 120) * inLayer;
          const k = ((rows - 1 - iz) * NX + ix) * 4;
          cimg.data[k] = 255;
          cimg.data[k + 1] = 255;
          cimg.data[k + 2] = 255;
          cimg.data[k + 3] = Math.round(a * 255);
        }
      }
      clCtx.putImageData(cimg, 0, 0);
      o.imageSmoothingEnabled = true;
      o.drawImage(
        cl,
        sx(field.xs[0]),
        sz(field.zs[rows - 1]),
        sx(field.xs[NX - 1]) - sx(field.xs[0]),
        sz(0) - sz(field.zs[rows - 1])
      );

      // 流線
      o.lineWidth = 1;
      for (let z0 = 250; z0 < Z_TOP; z0 += 500) {
        o.strokeStyle = "rgba(255,255,255,0.28)";
        o.beginPath();
        for (let ix = 0; ix < NX; ix++) {
          const x = field.xs[ix];
          const Y = sz(z0 + etaAt(field, x, z0));
          if (ix === 0) o.moveTo(sx(x), Y);
          else o.lineTo(sx(x), Y);
        }
        o.stroke();
      }

      // 山
      o.fillStyle = "#4a3b2a";
      o.beginPath();
      o.moveTo(0, secH);
      for (let i = 0; i <= 300; i++) {
        const x = X_MIN + ((X_MAX - X_MIN) * i) / 300;
        o.lineTo(sx(x), sz((p.h0 * p.a * p.a) / (x * x + p.a * p.a)));
      }
      o.lineTo(w, secH);
      o.closePath();
      o.fill();

      // 目盛り
      o.fillStyle = "rgba(255,255,255,0.6)";
      o.font = "11px ui-monospace, monospace";
      for (let km = 0; km <= 120; km += 20) {
        o.fillText(`${km}km`, sx(km * 1000) - 12, secH - 4);
      }
      for (let km = 2; km < Z_TOP / 1000; km += 2) {
        o.fillText(`${km}km`, 4, sz(km * 1000) + 4);
      }
      o.font = "12px ui-monospace, monospace";
      o.fillText("断面図（縦方向は約10倍に誇張）  風 →", 52, 18);

      // 上から見た図
      const img = o.createImageData(Math.round(w * dpr), Math.round(topH * dpr));
      const W = img.width;
      const Hh = img.height;
      const ridgeAmp = 7000;
      for (let py = 0; py < Hh; py++) {
        const yy = py / Hh;
        const curve = ridgeAmp * Math.sin(yy * Math.PI * 1.6 + 0.4);
        for (let px = 0; px < W; px++) {
          const xw = X_MIN + ((X_MAX - X_MIN) * px) / W - curve;
          const fi = ((xw - X_MIN) / (X_MAX - X_MIN)) * (NX - 1);
          const i0 = Math.max(0, Math.min(NX - 1, Math.floor(fi)));
          const i1 = Math.min(NX - 1, i0 + 1);
          const t = Math.max(0, Math.min(1, fi - i0));
          let c = fi < 0 || fi > NX - 1 ? 0 : cover[i0] * (1 - t) + cover[i1] * t;
          const tex =
            0.78 +
            0.22 * Math.sin(px * 0.09 + Math.sin(py * 0.05) * 3) * Math.sin(py * 0.13 + px * 0.01);
          c = Math.max(0, Math.min(1, c * tex));
          const ridge = Math.exp(-(xw * xw) / (p.a * p.a * 0.8));
          const gr = 46 + 60 * ridge;
          const gg = 70 + 20 * ridge;
          const gb = 48 + 10 * ridge;
          const k = (py * W + px) * 4;
          img.data[k] = gr + (245 - gr) * c;
          img.data[k + 1] = gg + (248 - gg) * c;
          img.data[k + 2] = gb + (252 - gb) * c;
          img.data[k + 3] = 255;
        }
      }
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.putImageData(img, 0, Math.round(topY * dpr));
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.fillStyle = "#0b1020";
      o.fillRect(0, secH, w, topY - secH);
      o.fillStyle = "rgba(255,255,255,0.75)";
      o.fillText("上から見た図（衛星写真のイメージ）  風 →  茶色の帯が山脈", 8, secH + 19);

      staticLayer.current = { key, canvas: off };
    }

    ctx.drawImage(staticLayer.current.canvas, 0, 0, w, h);

    // 流れる空気塊（雲の中では白く）
    const visSpeed = ((X_MAX - X_MIN) / 14) * (p.U / 15);
    for (const pt of particles.current) {
      pt.x += visSpeed * dt;
      if (pt.x > X_MAX) pt.x -= X_MAX - X_MIN;
      const z = pt.z0 + etaAt(field, pt.x, pt.z0);
      if (z > Z_TOP) continue;
      const inCloud = isCloud(pt.x, pt.z0);
      ctx.fillStyle = inCloud ? "#ffffff" : "rgba(186,230,253,0.75)";
      ctx.beginPath();
      ctx.arc(sx(pt.x), sz(z), inCloud ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <canvas
        ref={canvasRef}
        className="w-full h-[560px] sm:h-[660px] rounded-xl border border-white/10"
      />
      <div className="space-y-4 p-4 bg-gray-900/70 rounded-xl border border-white/10 self-start">
        <div className="grid grid-cols-3 gap-2">
          {CLOUD_PRESETS.map((pr) => (
            <button
              key={pr.name}
              onClick={() => setParams(pr.p)}
              className="text-xs px-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10"
              title={pr.desc}
            >
              {pr.name}
            </button>
          ))}
        </div>
        <Slider
          label="風速 U"
          value={params.U}
          min={5}
          max={30}
          step={1}
          display={`${params.U} m/s`}
          onChange={(v) => set({ U: v })}
        />
        <Slider
          label="下層の安定度 N₁"
          value={params.N1}
          min={0.006}
          max={0.02}
          step={0.0005}
          display={`${params.N1.toFixed(4)} /s`}
          onChange={(v) => set({ N1: v })}
        />
        <Slider
          label="上層の安定度 N₂"
          value={params.N2}
          min={0.002}
          max={0.02}
          step={0.0005}
          display={`${params.N2.toFixed(4)} /s`}
          onChange={(v) => set({ N2: v })}
        />
        <Slider
          label="下層の厚さ H"
          value={params.H}
          min={1000}
          max={5000}
          step={100}
          display={`${(params.H / 1000).toFixed(1)} km`}
          onChange={(v) => set({ H: v })}
        />
        <Slider
          label="山の高さ"
          value={params.h0}
          min={100}
          max={1200}
          step={50}
          display={`${params.h0} m`}
          onChange={(v) => set({ h0: v })}
        />
        <Slider
          label="山の幅（半値幅）"
          value={params.a}
          min={1000}
          max={10000}
          step={250}
          display={`${(params.a / 1000).toFixed(2)} km`}
          onChange={(v) => set({ a: v })}
        />
        <Slider
          label="湿った層の下端"
          value={params.moistBottom}
          min={200}
          max={6000}
          step={100}
          display={`${(params.moistBottom / 1000).toFixed(1)} km`}
          onChange={(v) => set({ moistBottom: Math.min(v, params.moistTop - 200) })}
        />
        <Slider
          label="湿った層の上端"
          value={params.moistTop}
          min={400}
          max={7000}
          step={100}
          display={`${(params.moistTop / 1000).toFixed(1)} km`}
          onChange={(v) => set({ moistTop: Math.max(v, params.moistBottom + 200) })}
        />
        <Slider
          label="湿り具合（露点差）"
          value={params.dewpointDep}
          min={0.5}
          max={6}
          step={0.5}
          display={`${params.dewpointDep} K → ${liftToSaturate(params.dewpointDep)} m 上がれば飽和`}
          onChange={(v) => set({ dewpointDep: v })}
        />
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-black/40 rounded p-2">
            <div className="text-gray-500">Scorer l₁ = N₁/U</div>
            <div className="text-sky-300">{(l1 * 1000).toFixed(2)} /km</div>
          </div>
          <div className="bg-black/40 rounded p-2">
            <div className="text-gray-500">Scorer l₂ = N₂/U</div>
            <div className="text-sky-300">{(l2 * 1000).toFixed(2)} /km</div>
          </div>
          <div className="bg-black/40 rounded p-2 col-span-2">
            <div className="text-gray-500">捕捉条件 l₁² − l₂² &gt; π²/4H²</div>
            <div className={lambda ? "text-emerald-300" : "text-rose-300"}>
              {lambda
                ? `満たす → 風下波の波長 約 ${(lambda / 1000).toFixed(1)} km`
                : "満たさない → 波は上空へ抜ける"}
            </div>
          </div>
        </div>
      </div>
      <article className="lg:col-span-2 space-y-3 text-gray-300 leading-relaxed text-sm max-w-3xl">
        <h3 className="text-lg font-semibold text-white">
          しくみ：雲は流れず、空気が雲を通り抜ける
        </h3>
        <p>
          安定した大気の中で風が山を越えると、持ち上げられた空気は浮力で押し戻され、前のタブの重力波が生まれます。風が一定で山が動かないので、波は地面に対して止まった
          <strong className="text-white">定在波（山岳波）</strong>になります。
        </p>
        <p>
          波の山では空気が持ち上げられて膨張し、冷えます。湿った空気なら露点まで冷えたところで水蒸気が凝結して雲になり、波の谷へ下ると温まって雲は消えます。
          そのため、空気は風に乗って通り過ぎていくのに、
          <strong className="text-white">雲は同じ場所にとどまって</strong>
          山脈と平行な筋が何本も並びます（断面図の点が雲に入ると白く光り、出ると青に戻るのを見てください）。衛星写真で山脈の風下に縞模様として写る波状雲がこれです。
          雲の種類としては主に
          <Link href="/clouds#altocumulus" className="text-sky-300 hover:underline">
            高積雲
          </Link>
          （レンズ雲）で、
          <Link href="/clouds" className="text-sky-300 hover:underline">
            十種雲形のページ
          </Link>
          で他の雲と並べて説明しています。
        </p>
        <Formula>持ち上げ η ≥ 約125 m × 露点差 → 雲</Formula>
        <p>
          筋が風下に何本も並ぶのは、波が下層に閉じ込められたときです。風速 U と安定度 N の比 l =
          N/U（Scorer パラメータ）が、下層で大きく上層で小さいと、
          上へ逃げようとする波が反射して下層を横に伝わります。条件は l₁² − l₂² &gt; π²/(4H²)
          です。上空まで同じ安定度だと、波は斜め上へエネルギーを逃がすので、筋は並びません（「上へ抜ける波」）。
        </p>
        <p className="text-gray-500 text-xs">
          計算方法：2層大気の線形・非静力学の定常山岳波をフーリエ合成で解いています（山の形は Witch
          of
          Agnesi）。線形理論なので、山が高すぎたり風が弱すぎたりすると、実際の流れ（はく離やローター）からずれます。
        </p>
      </article>
    </div>
  );
}

// ===================================================================================

const TABS = [
  { id: "inertial", label: "慣性波" },
  { id: "gravity", label: "重力波" },
  { id: "cloud", label: "筋雲（波状雲）" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AtmosphericWaves() {
  const [tab, setTab] = useState<TabId>("inertial");
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-transparent">
            大気の波 — 慣性波・重力波・筋雲
          </h1>
          <p className="text-gray-400 text-sm max-w-3xl">
            大気の波は「ずらすと元に戻ろうとする力」があるところに生まれます。復元力がコリオリ力なら慣性波、浮力なら重力波。
            そして重力波が山で起こされ、湿った空気を持ち上げると、山脈の風下に筋状の雲が並びます。
          </p>
        </header>
        <nav className="flex gap-2 border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                tab === t.id
                  ? "bg-white/10 text-white border-b-2 border-sky-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === "inertial" && <InertialPanel />}
        {tab === "gravity" && <GravityPanel />}
        {tab === "cloud" && <CloudPanel />}
      </div>
    </div>
  );
}
