"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Zap, Info } from "lucide-react";

// ─── Network topology ──────────────────────────────────────────────────────
const TOPOLOGY = [3, 5, 5, 2];
const LAYER_LABELS = ["Input", "Hidden 1", "Hidden 2", "Output"];
const LAYER_COLORS = ["#ff6b9d", "#c77dff", "#48cae4", "#ffd60a"];

// ─── Canvas dimensions ─────────────────────────────────────────────────────
const W = 800;
const H = 480;
const PAD_X = 110;
const PAD_Y = 70;
const NODE_R = 22;

// ─── Precompute node positions ─────────────────────────────────────────────
const POS = TOPOLOGY.map((count, l) => {
  const x = PAD_X + (l * (W - 2 * PAD_X)) / (TOPOLOGY.length - 1);
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: count === 1 ? H / 2 : PAD_Y + (i * (H - 2 * PAD_Y)) / (count - 1),
  }));
});

// ─── Random weight matrix ──────────────────────────────────────────────────
const WEIGHTS = TOPOLOGY.slice(0, -1).map((fromN, l) =>
  Array.from({ length: fromN }, () =>
    Array.from({ length: TOPOLOGY[l + 1] }, () => Math.random() * 2 - 1)
  )
);

// ─── Colour helpers ────────────────────────────────────────────────────────
function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
const RGBS = LAYER_COLORS.map(parseHex);

function rgb(layer: number, a = 1) {
  const { r, g, b } = RGBS[layer];
  return `rgba(${r},${g},${b},${a})`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface TrailPt {
  x: number;
  y: number;
}

interface Pulse {
  id: number;
  layer: number; // source layer index (0 = input→h1)
  from: number;
  to: number;
  progress: number;
  trail: TrailPt[];
}

interface SimState {
  pulses: Pulse[];
  activations: number[][];
  lastFire: number[][]; // per-node debounce timestamp
  lastSpawn: number;
  time: number;
}

let uid = 0;

// ─── Canvas render ─────────────────────────────────────────────────────────
function render(ctx: CanvasRenderingContext2D, state: SimState) {
  // Background
  ctx.fillStyle = "#07071a";
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "rgba(50,60,120,0.18)";
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // ── Edges ──────────────────────────────────────────────────────────────
  ctx.save();
  TOPOLOGY.slice(0, -1).forEach((fromN, l) => {
    for (let i = 0; i < fromN; i++) {
      for (let j = 0; j < TOPOLOGY[l + 1]; j++) {
        const w = WEIGHTS[l][i][j];
        const { x: x1, y: y1 } = POS[l][i];
        const { x: x2, y: y2 } = POS[l + 1][j];
        const alpha = 0.04 + Math.abs(w) * 0.18;
        ctx.strokeStyle = w > 0 ? `rgba(80,130,255,${alpha})` : `rgba(255,80,110,${alpha})`;
        ctx.lineWidth = Math.abs(w) * 1.8 + 0.3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  });
  ctx.restore();

  // ── Pulse trails ────────────────────────────────────────────────────────
  state.pulses.forEach((p) => {
    const { r, g, b } = RGBS[p.layer];
    p.trail.forEach((pt, idx) => {
      const t = idx / p.trail.length;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, lerp(1, 4.5, t), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${t * 0.45})`;
      ctx.fill();
    });
  });

  // ── Pulses ──────────────────────────────────────────────────────────────
  state.pulses.forEach((p) => {
    const from = POS[p.layer][p.from];
    const to = POS[p.layer + 1][p.to];
    const x = lerp(from.x, to.x, p.progress);
    const y = lerp(from.y, to.y, p.progress);
    const { r, g, b } = RGBS[p.layer];

    ctx.save();
    ctx.shadowColor = LAYER_COLORS[p.layer];
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
    ctx.fill();
    ctx.restore();
  });

  // ── Nodes ───────────────────────────────────────────────────────────────
  TOPOLOGY.forEach((count, l) => {
    const color = LAYER_COLORS[l];
    const { r, g, b } = RGBS[l];

    for (let n = 0; n < count; n++) {
      const { x, y } = POS[l][n];
      const act = state.activations[l][n];

      // Outer glow
      if (act > 0.02) {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, NODE_R * 3);
        gr.addColorStop(0, `rgba(${r},${g},${b},${act * 0.4})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(x, y, NODE_R * 3, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Node fill (radial gradient)
      const fill = ctx.createRadialGradient(x - 5, y - 6, 0, x, y, NODE_R);
      fill.addColorStop(
        0,
        `rgba(${Math.min(255, r * act + 45)},${Math.min(255, g * act + 45)},${Math.min(255, b * act + 60)},1)`
      );
      fill.addColorStop(1, "rgba(10,10,30,1)");
      ctx.beginPath();
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // Border with glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 + act * 28;
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + act * 0.7})`;
      ctx.lineWidth = 1.5 + act * 2.5;
      ctx.stroke();
      ctx.restore();

      // Activation value text
      if (act > 0.06) {
        ctx.save();
        ctx.font = `bold 10px ui-monospace`;
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, act * 1.8)})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(act.toFixed(2), x, y);
        ctx.restore();
      }
    }
  });

  // ── Layer labels ────────────────────────────────────────────────────────
  POS.forEach((layerPOS, l) => {
    const x = layerPOS[0].x;
    const { r, g, b } = RGBS[l];
    ctx.save();
    ctx.font = "bold 12px ui-monospace";
    ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(LAYER_LABELS[l], x, H - 22);
    ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
    ctx.font = "10px ui-monospace";
    ctx.fillText(`×${TOPOLOGY[l]}`, x, 10);
    ctx.restore();
  });

  // ── Weight legend (top-right) ────────────────────────────────────────────
  ctx.save();
  ctx.font = "10px ui-monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(80,130,255,0.5)";
  ctx.fillText("── positive weight", W - 10, 12);
  ctx.fillStyle = "rgba(255,80,110,0.5)";
  ctx.fillText("── negative weight", W - 10, 26);
  ctx.restore();
}

// ─── Main component ────────────────────────────────────────────────────────
export default function NeuralNetViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRunRef = useRef(false);
  const speedRef = useRef(5);

  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(5);

  useEffect(() => {
    isRunRef.current = isRunning;
  }, [isRunning]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // ── Animation loop (runs once, forever) ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const state: SimState = {
      pulses: [],
      activations: TOPOLOGY.map((n) => new Array(n).fill(0)),
      lastFire: TOPOLOGY.map((n) => new Array(n).fill(-9999)),
      lastSpawn: 0,
      time: 0,
    };

    let rafId: number;
    let lastTs = 0;

    function tick(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      if (isRunRef.current) {
        state.time += dt;
        const spd = speedRef.current;
        const spawnInterval = 1.4 / spd;

        // ── Spawn input pulses ───────────────────────────────────────────
        if (state.time - state.lastSpawn > spawnInterval) {
          state.lastSpawn = state.time;
          const inputNode = Math.floor(Math.random() * TOPOLOGY[0]);
          for (let j = 0; j < TOPOLOGY[1]; j++) {
            state.pulses.push({
              id: uid++,
              layer: 0,
              from: inputNode,
              to: j,
              progress: 0,
              trail: [],
            });
          }
        }

        // ── Update pulses ────────────────────────────────────────────────
        const vel = spd * 0.52;
        const done: number[] = [];
        const born: Pulse[] = [];

        state.pulses.forEach((p, idx) => {
          // Record trail position
          const from = POS[p.layer][p.from];
          const to = POS[p.layer + 1][p.to];
          const cx = lerp(from.x, to.x, p.progress);
          const cy = lerp(from.y, to.y, p.progress);
          p.trail.push({ x: cx, y: cy });
          if (p.trail.length > 10) p.trail.shift();

          p.progress += vel * dt;

          if (p.progress >= 1) {
            done.push(idx);
            const dl = p.layer + 1;
            const dn = p.to;

            // Fire destination node
            state.activations[dl][dn] = Math.min(1.0, state.activations[dl][dn] + 0.8);

            // Cascade forward (debounced per node)
            const debounce = spawnInterval * 0.75;
            if (dl < TOPOLOGY.length - 1 && state.time - state.lastFire[dl][dn] > debounce) {
              state.lastFire[dl][dn] = state.time;
              for (let j = 0; j < TOPOLOGY[dl + 1]; j++) {
                born.push({
                  id: uid++,
                  layer: dl,
                  from: dn,
                  to: j,
                  progress: 0,
                  trail: [],
                });
              }
            }
          }
        });

        // Remove completed pulses (reverse to preserve indices)
        for (let i = done.length - 1; i >= 0; i--) {
          state.pulses.splice(done[i], 1);
        }
        state.pulses.push(...born);

        // Cap total pulses for performance
        if (state.pulses.length > 500) {
          state.pulses = state.pulses.slice(-300);
        }

        // Decay activations (~1.5s half-life)
        for (let l = 0; l < TOPOLOGY.length; l++) {
          for (let n = 0; n < TOPOLOGY[l]; n++) {
            state.activations[l][n] *= 1 - 1.6 * dt;
            if (state.activations[l][n] < 0.001) state.activations[l][n] = 0;
          }
        }
      }

      render(ctx, state);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #07071a 0%, #0d0d2b 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 20,
        fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", monospace',
      }}
    >
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: "center" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Zap size={20} color="#7090ff" />
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              background: "linear-gradient(90deg, #7090ff, #c77dff, #48cae4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Neural Network — Forward Propagation
          </h1>
          <Zap size={20} color="#48cae4" />
        </div>
        <p style={{ color: "rgba(160,170,220,0.45)", fontSize: 12, margin: "6px 0 0" }}>
          Architecture: {TOPOLOGY.join(" → ")} &nbsp;|&nbsp; Edge opacity ∝ |weight|
        </p>
      </motion.div>

      {/* Canvas */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        style={{
          borderRadius: 16,
          border: "1px solid rgba(100,120,255,0.2)",
          boxShadow: "0 0 60px rgba(80,100,255,0.12), 0 0 120px rgba(80,100,255,0.06)",
          overflow: "hidden",
          maxWidth: "100%",
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: "block", maxWidth: "100%" }}
        />
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "center",
          background: "rgba(255,255,255,0.04)",
          padding: "14px 24px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Start / Stop */}
        <motion.button
          onClick={() => setIsRunning((v) => !v)}
          whileTap={{ scale: 0.93 }}
          whileHover={{ scale: 1.04 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 22px",
            borderRadius: 10,
            border: "none",
            background: isRunning
              ? "linear-gradient(135deg,rgba(255,70,90,0.9),rgba(200,40,60,0.9))"
              : "linear-gradient(135deg,rgba(60,110,255,0.9),rgba(100,60,220,0.9))",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            boxShadow: isRunning ? "0 0 20px rgba(255,70,90,0.3)" : "0 0 20px rgba(60,110,255,0.3)",
            fontFamily: "inherit",
            transition: "background 0.25s, box-shadow 0.25s",
          }}
        >
          {isRunning ? <Pause size={15} /> : <Play size={15} />}
          {isRunning ? "停止" : "開始"}
        </motion.button>

        {/* Speed slider */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "rgba(190,200,255,0.7)",
            fontSize: 13,
          }}
        >
          速度
          <input
            type="range"
            min={1}
            max={10}
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            style={{ width: 110, accentColor: "#7090ff", cursor: "pointer" }}
          />
          <span
            style={{
              minWidth: 22,
              textAlign: "center",
              color: "#aac",
              fontWeight: 700,
            }}
          >
            {speed}
          </span>
        </label>

        {/* Layer legend */}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {LAYER_LABELS.map((lbl, i) => {
            const { r, g, b } = RGBS[i];
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: `rgba(${r},${g},${b},0.85)`,
                }}
              >
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: LAYER_COLORS[i],
                    boxShadow: `0 0 6px ${LAYER_COLORS[i]}`,
                  }}
                />
                {lbl}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Info footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "rgba(140,150,200,0.35)",
          fontSize: 11,
        }}
      >
        <Info size={12} />
        パルスがエッジを伝って各層のニューロンを「発火」させる様子を表しています
      </motion.div>
    </div>
  );
}
