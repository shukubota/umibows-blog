"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const LINE_SPACING = 60;
const NEEDLE_LENGTH = LINE_SPACING;
const MAX_DISPLAY_NEEDLES = 3000;

interface Needle {
  cx: number;
  cy: number;
  angle: number;
  crosses: boolean;
}

export default function BuffonNeedlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const needlesRef = useRef<Needle[]>([]);
  const throwCountRef = useRef(0);
  const crossCountRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [throwCount, setThrowCount] = useState(0);
  const [crossCount, setCrossCount] = useState(0);
  const [speed, setSpeed] = useState(20);

  const estimatedPi = crossCount > 0 ? (2 * throwCount) / crossCount : null;

  const throwNeedle = useCallback((): Needle => {
    const canvas = canvasRef.current!;
    const cx = Math.random() * canvas.width;
    const cy = Math.random() * canvas.height;
    const angle = Math.random() * Math.PI;

    const halfLen = NEEDLE_LENGTH / 2;
    const distToLine = cy % LINE_SPACING;
    const dist = Math.min(distToLine, LINE_SPACING - distToLine);
    const crosses = dist <= halfLen * Math.abs(Math.sin(angle));

    return { cx, cy, angle, crosses };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (let y = 0; y <= canvas.height + LINE_SPACING; y += LINE_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const needles = needlesRef.current;
    const halfLen = NEEDLE_LENGTH / 2;
    for (let i = 0; i < needles.length; i++) {
      const n = needles[i];
      const dx = halfLen * Math.cos(n.angle);
      const dy = halfLen * Math.sin(n.angle);
      ctx.beginPath();
      ctx.moveTo(n.cx - dx, n.cy - dy);
      ctx.lineTo(n.cx + dx, n.cy + dy);
      ctx.strokeStyle = n.crosses ? "rgba(239,68,68,0.75)" : "rgba(96,165,250,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, []);

  const runFrame = useCallback(() => {
    if (!canvasRef.current) return;

    let newCross = 0;
    const batch: Needle[] = [];
    for (let i = 0; i < speed; i++) {
      const n = throwNeedle();
      batch.push(n);
      if (n.crosses) newCross++;
    }

    throwCountRef.current += speed;
    crossCountRef.current += newCross;

    const combined = [...needlesRef.current, ...batch];
    needlesRef.current = combined.length > MAX_DISPLAY_NEEDLES
      ? combined.slice(combined.length - MAX_DISPLAY_NEEDLES)
      : combined;

    draw();
    setThrowCount(throwCountRef.current);
    setCrossCount(crossCountRef.current);

    animFrameRef.current = requestAnimationFrame(runFrame);
  }, [speed, throwNeedle, draw]);

  useEffect(() => {
    if (isRunning) {
      animFrameRef.current = requestAnimationFrame(runFrame);
    } else {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isRunning, runFrame]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleReset = () => {
    setIsRunning(false);
    needlesRef.current = [];
    throwCountRef.current = 0;
    crossCountRef.current = 0;
    setThrowCount(0);
    setCrossCount(0);
    setTimeout(draw, 50);
  };

  const piError = estimatedPi !== null ? Math.abs(estimatedPi - Math.PI) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950 dark:bg-gray-950">
      <div className="w-full max-w-4xl bg-gray-900 rounded-xl shadow-lg p-6 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-2 text-gray-100">
          ビュッフォンの針 (Buffon&apos;s Needle)
        </h1>
        <p className="mb-2 text-gray-400 text-center max-w-2xl text-sm">
          等間隔 D の平行線上に長さ L = D の針を N 回投げる。
          線をまたいだ回数 C から <span className="font-mono text-blue-400">π ≈ 2N / C</span> が求まる。
        </p>

        <div className="mb-1 text-gray-500 text-xs text-center">
          <span className="text-red-400">赤</span> = 線をまたいだ針　／
          <span className="text-blue-400">青</span> = またがなかった針（表示は最新 {MAX_DISPLAY_NEEDLES.toLocaleString()} 本）
        </div>

        <div className="relative rounded-lg overflow-hidden shadow-inner mb-6 mt-4 border border-gray-700">
          <canvas ref={canvasRef} width={700} height={420} className="block" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-6">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">投げた回数 N</div>
            <div className="text-xl font-mono text-white">{throwCount.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">またいだ回数 C</div>
            <div className="text-xl font-mono text-red-400">{crossCount.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">推定 π = 2N/C</div>
            <div className="text-xl font-mono text-green-400">
              {estimatedPi !== null ? estimatedPi.toFixed(6) : "—"}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">真値との誤差</div>
            <div className="text-xl font-mono text-yellow-400">
              {piError !== null ? piError.toFixed(6) : "—"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6 items-center justify-center">
          <button
            onClick={() => setIsRunning((r) => !r)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            {isRunning ? "停止" : "開始"}
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            リセット
          </button>
        </div>

        <div className="w-full max-w-xs mb-6">
          <label className="text-gray-300 text-sm font-medium block mb-1 text-center">
            速度: {speed} 本 / フレーム
          </label>
          <input
            type="range"
            min="1"
            max="200"
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Formula explanation */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6 max-w-2xl w-full text-sm text-gray-300">
          <h3 className="font-semibold text-gray-100 mb-2">仕組み</h3>
          <ul className="space-y-1 text-xs text-gray-400">
            <li>・平行線の間隔 D = 針の長さ L のとき、針が線をまたぐ確率 = 2/π</li>
            <li>・よって π ≈ 2 × (投げた回数) / (またいだ回数)</li>
            <li>・投げる回数を増やすほど大数の法則により真値 π に近づく</li>
          </ul>
        </div>

        <Link href="/" className="text-blue-500 hover:underline text-sm">
          &larr; ホームに戻る
        </Link>
      </div>
    </main>
  );
}
