"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CloudId } from "@/lib/clouds/types";
import { defaultParams, getSim } from "@/lib/cloud-sim";
import type { Params, Readout, SimParam } from "@/lib/cloud-sim";
import { formatDuration } from "@/lib/cloud-sim/draw";

const SPEEDS = [0.25, 1, 4, 16];

function paramDigits(p: SimParam): number {
  if (p.digits !== undefined) return p.digits;
  const s = String(p.step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/** 雲のでき方のシミュレーションを canvas で再生する。画面外にあるあいだは止める。 */
export default function CloudSimPlayer({ id }: { id: CloudId }) {
  const sim = useMemo(() => getSim(id), [id]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [params, setParams] = useState<Params>(() => (sim ? defaultParams(sim) : {}));
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [epoch, setEpoch] = useState(0); // リセットのたびに増やす
  const [readouts, setReadouts] = useState<Readout[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);

  const live = useRef({ running, speed });
  useEffect(() => {
    live.current = { running, speed };
  }, [running, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const state = sim.init(params);
    let visible = false;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    let done = false;
    setFinished(false);

    const publish = () => {
      setReadouts(sim.readouts(state, params));
      setElapsed(sim.time(state));
    };
    publish();

    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      // フレームが間引かれる端末でも進みが遅くなりすぎないよう、1コマ最大 0.25 秒ぶん進める
      const realDt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { running: on, speed: sp } = live.current;
      if (on && !done) {
        let remaining = realDt * sim.timeScale * sp;
        let guard = 0;
        while (remaining > 1e-12 && guard++ < 2000) {
          const dt = Math.min(sim.maxDt, remaining);
          sim.step(state, params, dt);
          remaining -= dt;
          if (sim.duration !== undefined && sim.time(state) >= sim.duration) {
            done = true;
            setFinished(true);
            break;
          }
        }
      }
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
        sim.draw(ctx, state, params, w, h);
      }
      if (now - lastUi > 200) {
        lastUi = now;
        publish();
      }
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sim, params, epoch]);

  if (!sim) return <p className="text-sm text-gray-500">シミュレーションは準備中です。</p>;

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-white/10 bg-black"
        style={{ aspectRatio: `1 / ${sim.aspect ?? 0.55}` }}
        aria-label={sim.title}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => (finished ? setEpoch((e) => e + 1) : setRunning((r) => !r))}
          className="rounded-md bg-sky-600 px-3 py-1 text-white hover:bg-sky-500"
        >
          {finished ? "もう一度" : running ? "一時停止" : "再生"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(true);
            setEpoch((e) => e + 1);
          }}
          className="rounded-md border border-white/20 px-3 py-1 text-gray-200 hover:bg-white/10"
        >
          最初から
        </button>
        <span className="text-gray-400 ml-1">速さ</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-2 py-0.5 font-mono text-xs ${
              speed === s ? "bg-white/20 text-white" : "text-gray-400 hover:bg-white/10"
            }`}
          >
            ×{s}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs text-gray-400">
          経過 {formatDuration(elapsed)}
          {finished && "（終了）"}
        </span>
      </div>
      {readouts.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {readouts.map((r) => (
            <div key={r.label} className="rounded-md bg-black/30 px-3 py-1.5">
              <dt className="text-[11px] text-gray-400">{r.label}</dt>
              <dd className="font-mono text-sm text-sky-200">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {sim.params.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {sim.params.map((p) => (
            <label key={p.key} className="block space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{p.label}</span>
                <span className="font-mono text-sky-300">
                  {(params[p.key] ?? p.value).toFixed(paramDigits(p))} {p.unit}
                </span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key] ?? p.value}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setParams((prev) => ({ ...prev, [p.key]: v }));
                  setRunning(true);
                }}
                className="w-full accent-sky-400"
              />
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">パラメータを変えると最初から計算し直します。</p>
    </div>
  );
}
