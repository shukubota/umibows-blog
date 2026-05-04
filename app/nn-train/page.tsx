"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";

// ─── Config ────────────────────────────────────────────────────────────────
const N_POINTS = 100; // per class
const GRID_RES = 65; // decision boundary resolution

// ─── Activation functions ──────────────────────────────────────────────────
const clamp = (x: number) => Math.max(-500, Math.min(500, x));
const ACTS = {
  relu: {
    fn: (x: number) => Math.max(0, x),
    deriv: (a: number) => (a > 0 ? 1 : 0), // a = post-activation
  },
  tanh: {
    fn: Math.tanh,
    deriv: (a: number) => 1 - a * a,
  },
  sigmoid: {
    fn: (x: number) => 1 / (1 + Math.exp(-clamp(x))),
    deriv: (a: number) => a * (1 - a),
  },
} as const;
const sigmoidFn = ACTS.sigmoid.fn;
type ActKey = keyof typeof ACTS;

// ─── Data generation ───────────────────────────────────────────────────────
type Point = { x: number; y: number; label: number };

function genSpiral(n: number): Point[] {
  const pts: Point[] = [];
  for (let cls = 0; cls < 2; cls++) {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const r = 0.15 + t * 0.8;
      const angle = t * 3.6 * Math.PI + cls * Math.PI + (Math.random() - 0.5) * 0.22;
      pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), label: cls });
    }
  }
  return pts;
}

// ─── MLP ───────────────────────────────────────────────────────────────────
interface Net {
  W: number[][][]; // W[l][i][j]: weight layer l→l+1, node i→j
  b: number[][];   // b[l][j]: bias for node j in layer l+1
  topo: number[];
}

function createNet(topo: number[]): Net {
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 0; l < topo.length - 1; l++) {
    const scale = Math.sqrt(2 / topo[l]); // He init
    W.push(
      Array.from({ length: topo[l] }, () =>
        Array.from({ length: topo[l + 1] }, () => (Math.random() * 2 - 1) * scale),
      ),
    );
    b.push(new Array(topo[l + 1]).fill(0));
  }
  return { W, b, topo };
}

// Returns post-activation values for each layer
function fwd(net: Net, input: number[], actKey: ActKey): number[][] {
  const act = ACTS[actKey];
  const acts: number[][] = [input];
  for (let l = 0; l < net.W.length; l++) {
    const prev = acts[l];
    const isLast = l === net.W.length - 1;
    const next = net.b[l].map((bias, j) => {
      let s = bias;
      for (let i = 0; i < prev.length; i++) s += prev[i] * net.W[l][i][j];
      return isLast ? sigmoidFn(s) : act.fn(s);
    });
    acts.push(next);
  }
  return acts;
}

function trainBatch(net: Net, batch: Point[], lr: number, actKey: ActKey): number {
  const act = ACTS[actKey];
  const dW = net.W.map((l) => l.map((r) => new Array(r.length).fill(0)));
  const db = net.b.map((b) => new Array(b.length).fill(0));
  let loss = 0;

  for (const pt of batch) {
    const acts = fwd(net, [pt.x, pt.y], actKey);
    const L = net.W.length;
    const out = acts[L][0];
    const t = pt.label;
    const eps = 1e-7;
    loss -= t * Math.log(out + eps) + (1 - t) * Math.log(1 - out + eps);

    // delta[l] = gradient w.r.t. pre-activation of layer l+1
    const delta: number[][] = new Array(L);
    delta[L - 1] = [out - t]; // BCE + sigmoid simplification

    for (let l = L - 2; l >= 0; l--) {
      const sz = net.topo[l + 1];
      delta[l] = new Array(sz).fill(0);
      for (let i = 0; i < sz; i++) {
        let s = 0;
        for (let j = 0; j < delta[l + 1].length; j++) {
          s += net.W[l + 1][i][j] * delta[l + 1][j];
        }
        delta[l][i] = s * act.deriv(acts[l + 1][i]);
      }
    }

    for (let l = 0; l < L; l++) {
      for (let i = 0; i < net.W[l].length; i++) {
        for (let j = 0; j < net.W[l][i].length; j++) {
          dW[l][i][j] += acts[l][i] * delta[l][j];
        }
      }
      for (let j = 0; j < net.b[l].length; j++) db[l][j] += delta[l][j];
    }
  }

  const n = batch.length;
  for (let l = 0; l < net.W.length; l++) {
    for (let i = 0; i < net.W[l].length; i++) {
      for (let j = 0; j < net.W[l][i].length; j++) {
        net.W[l][i][j] -= (lr * dW[l][i][j]) / n;
      }
    }
    for (let j = 0; j < net.b[l].length; j++) net.b[l][j] -= (lr * db[l][j]) / n;
  }
  return loss / batch.length;
}

function computeAccuracy(net: Net, data: Point[], actKey: ActKey): number {
  let ok = 0;
  for (const pt of data) {
    const acts = fwd(net, [pt.x, pt.y], actKey);
    if ((acts[acts.length - 1][0] > 0.5 ? 1 : 0) === pt.label) ok++;
  }
  return ok / data.length;
}

// ─── Canvas renderers ──────────────────────────────────────────────────────

function renderBoundary(
  ctx: CanvasRenderingContext2D,
  net: Net,
  data: Point[],
  actKey: ActKey,
  W: number,
  H: number,
) {
  // Pre-compute grid
  const grid = new Float32Array(GRID_RES * GRID_RES);
  for (let gy = 0; gy < GRID_RES; gy++) {
    for (let gx = 0; gx < GRID_RES; gx++) {
      const wx = (gx / (GRID_RES - 1)) * 2 - 1;
      const wy = (gy / (GRID_RES - 1)) * 2 - 1;
      const acts = fwd(net, [wx, wy], actKey);
      grid[gy * GRID_RES + gx] = acts[acts.length - 1][0];
    }
  }

  // Render pixels via ImageData
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const gx = Math.round((px / (W - 1)) * (GRID_RES - 1));
      const gy = Math.round((py / (H - 1)) * (GRID_RES - 1));
      const p = grid[gy * GRID_RES + gx];
      // p≈0 → class 0 (warm red), p≈1 → class 1 (cool blue)
      const idx = (py * W + px) * 4;
      img.data[idx + 0] = Math.round(180 * (1 - p) * 0.55 + 8);
      img.data[idx + 1] = Math.round((60 * (1 - p) + 80 * p) * 0.45 + 8);
      img.data[idx + 2] = Math.round(180 * p * 0.55 + 12);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Decision boundary contour (p ≈ 0.5)
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  const cellW = W / (GRID_RES - 1);
  const cellH = H / (GRID_RES - 1);
  for (let gy = 0; gy < GRID_RES - 1; gy++) {
    for (let gx = 0; gx < GRID_RES - 1; gx++) {
      const tl = grid[gy * GRID_RES + gx];
      const tr = grid[gy * GRID_RES + gx + 1];
      const bl = grid[(gy + 1) * GRID_RES + gx];
      const hasEdge =
        (tl > 0.5) !== (tr > 0.5) ||
        (tl > 0.5) !== (bl > 0.5);
      if (hasEdge) {
        ctx.beginPath();
        ctx.rect(gx * cellW, gy * cellH, cellW, cellH);
        ctx.stroke();
      }
    }
  }

  // Data points
  const PAD = 18;
  const toSX = (v: number) => PAD + ((v + 1) / 2) * (W - 2 * PAD);
  const toSY = (v: number) => PAD + ((v + 1) / 2) * (H - 2 * PAD);

  for (const pt of data) {
    const sx = toSX(pt.x);
    const sy = toSY(pt.y);
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = pt.label === 0 ? "#ff6060" : "#5090ff";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const LAYER_COLORS = ["#ff6b9d", "#c77dff", "#48cae4", "#ffd60a"];

function parseHex(hex: string) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function renderNetwork(
  ctx: CanvasRenderingContext2D,
  net: Net,
  sampleActs: number[][] | null,
  W: number,
  H: number,
) {
  ctx.fillStyle = "#07071a";
  ctx.fillRect(0, 0, W, H);

  const PX = 38;
  const PY = 36;
  const R = 14;

  const pos = net.topo.map((count, l) => {
    const x = PX + (l * (W - 2 * PX)) / (net.topo.length - 1);
    return Array.from({ length: count }, (_, i) => ({
      x,
      y: count === 1 ? H / 2 : PY + (i * (H - 2 * PY)) / (count - 1),
    }));
  });

  // Edges
  for (let l = 0; l < net.W.length; l++) {
    for (let i = 0; i < net.topo[l]; i++) {
      for (let j = 0; j < net.topo[l + 1]; j++) {
        const w = net.W[l][i][j];
        const alpha = Math.min(0.85, Math.abs(w) * 0.45 + 0.04);
        ctx.strokeStyle =
          w > 0 ? `rgba(80,140,255,${alpha})` : `rgba(255,80,100,${alpha})`;
        ctx.lineWidth = Math.min(2.5, Math.abs(w) * 1.2 + 0.3);
        ctx.beginPath();
        ctx.moveTo(pos[l][i].x, pos[l][i].y);
        ctx.lineTo(pos[l + 1][j].x, pos[l + 1][j].y);
        ctx.stroke();
      }
    }
  }

  // Nodes
  net.topo.forEach((count, l) => {
    const color = LAYER_COLORS[Math.min(l, LAYER_COLORS.length - 1)];
    const [cr, cg, cb] = parseHex(color);
    for (let n = 0; n < count; n++) {
      const { x, y } = pos[l][n];
      const act = sampleActs ? Math.max(0, Math.min(1, sampleActs[l][n])) : 0;

      // Glow
      if (act > 0.05) {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, R * 2.8);
        gr.addColorStop(0, `rgba(${cr},${cg},${cb},${act * 0.45})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(x, y, R * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Fill
      const fill = ctx.createRadialGradient(x - 4, y - 4, 0, x, y, R);
      fill.addColorStop(0, `rgba(${Math.min(255, cr * act + 35)},${Math.min(255, cg * act + 35)},${Math.min(255, cb * act + 40)},1)`);
      fill.addColorStop(1, "rgba(10,10,30,1)");
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // Border
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 4 + act * 22;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.3 + act * 0.7})`;
      ctx.lineWidth = 1.5 + act * 2;
      ctx.stroke();
      ctx.restore();

      // Activation value
      if (sampleActs && act > 0.08) {
        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, act * 2)})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(act.toFixed(2), x, y);
      }
    }
  });

  // Layer labels
  const labels = ["In", "H1", "H2", "Out"];
  net.topo.forEach((_, l) => {
    const [cr, cg, cb] = parseHex(LAYER_COLORS[Math.min(l, LAYER_COLORS.length - 1)]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.55)`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(labels[Math.min(l, labels.length - 1)], pos[l][0].x, H - 4);
  });
}

function renderChart(
  ctx: CanvasRenderingContext2D,
  losses: number[],
  accs: number[],
  W: number,
  H: number,
) {
  ctx.fillStyle = "#07071a";
  ctx.fillRect(0, 0, W, H);
  if (losses.length < 2) return;

  const pad = { t: 14, r: 12, b: 26, l: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const maxLoss = Math.max(losses[0] * 1.05, 0.5);

  // Grid
  ctx.strokeStyle = "rgba(80,90,150,0.18)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (cH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
  }

  const xOf = (i: number) => pad.l + (i / (losses.length - 1)) * cW;
  const yOfLoss = (v: number) => pad.t + Math.max(0, Math.min(1, 1 - v / maxLoss)) * cH;
  const yOfAcc = (v: number) => pad.t + (1 - v) * cH;

  // Loss curve
  ctx.beginPath();
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  losses.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOfLoss(v)) : ctx.lineTo(xOf(i), yOfLoss(v))));
  ctx.stroke();

  // Accuracy curve
  ctx.beginPath();
  ctx.strokeStyle = "#48cae4";
  ctx.lineWidth = 2;
  accs.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOfAcc(v)) : ctx.lineTo(xOf(i), yOfAcc(v))));
  ctx.stroke();

  // Labels
  ctx.font = "10px ui-monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ff6b6b";
  ctx.fillText(`Loss: ${losses[losses.length - 1].toFixed(3)}`, W - pad.r, pad.t + 11);
  ctx.fillStyle = "#48cae4";
  ctx.fillText(`Acc: ${(accs[accs.length - 1] * 100).toFixed(1)}%`, W - pad.r, pad.t + 24);

  ctx.fillStyle = "rgba(150,160,200,0.3)";
  ctx.textAlign = "left";
  ctx.fillText("epoch →", pad.l, H - 4);
  ctx.textAlign = "right";
  ctx.fillText(`${maxLoss.toFixed(1)}`, pad.l - 4, pad.t + 5);
  ctx.fillText("0", pad.l - 4, pad.t + cH + 5);
}

// ─── Main component ────────────────────────────────────────────────────────
export default function NNTrainPage() {
  const boundaryRef = useRef<HTMLCanvasElement>(null);
  const netRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);

  const isRunRef = useRef(false);
  const lrRef = useRef(0.03);
  const actRef = useRef<ActKey>("relu");

  const [isRunning, setIsRunning] = useState(false);
  const [lr, setLr] = useState(0.03);
  const [actKey, setActKey] = useState<ActKey>("relu");
  const [hiddenSize, setHiddenSize] = useState(8);
  const [epoch, setEpoch] = useState(0);
  const [dispAcc, setDispAcc] = useState(0);
  const [dispLoss, setDispLoss] = useState(0);

  // Mutable sim state (never triggers re-renders directly)
  const sim = useRef({
    net: createNet([2, 8, 8, 1]),
    data: genSpiral(N_POINTS),
    losses: [] as number[],
    accs: [] as number[],
    epoch: 0,
    sampleActs: null as number[][] | null,
  });

  useEffect(() => { isRunRef.current = isRunning; }, [isRunning]);
  useEffect(() => { lrRef.current = lr; }, [lr]);
  useEffect(() => { actRef.current = actKey; }, [actKey]);

  // Reset when hidden size changes
  useEffect(() => {
    const s = sim.current;
    s.net = createNet([2, hiddenSize, hiddenSize, 1]);
    s.losses = [];
    s.accs = [];
    s.epoch = 0;
    s.sampleActs = null;
    setEpoch(0); setDispAcc(0); setDispLoss(0);
  }, [hiddenSize]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    const s = sim.current;
    s.net = createNet([2, hiddenSize, hiddenSize, 1]);
    s.data = genSpiral(N_POINTS);
    s.losses = [];
    s.accs = [];
    s.epoch = 0;
    s.sampleActs = null;
    setEpoch(0); setDispAcc(0); setDispLoss(0);
  }, [hiddenSize]);

  // Permanent animation loop
  useEffect(() => {
    let rafId: number;
    let frameCount = 0;

    function tick() {
      const s = sim.current;

      if (isRunRef.current) {
        // 3 epochs per frame for smooth real-time feel
        for (let step = 0; step < 3; step++) {
          // Mini-batch SGD (shuffle + batch=32)
          const shuffled = s.data.slice().sort(() => Math.random() - 0.5);
          let lastLoss = 0;
          for (let b = 0; b < shuffled.length; b += 32) {
            lastLoss = trainBatch(s.net, shuffled.slice(b, b + 32), lrRef.current, actRef.current);
          }
          const acc = computeAccuracy(s.net, s.data, actRef.current);
          s.losses.push(lastLoss);
          s.accs.push(acc);
          s.epoch++;
        }

        if (s.losses.length > 300) {
          s.losses = s.losses.slice(-300);
          s.accs = s.accs.slice(-300);
        }

        // Forward pass on one sample for network activation display
        const demo = s.data[0];
        s.sampleActs = fwd(s.net, [demo.x, demo.y], actRef.current);

        // Update displayed stats every 4 frames
        if (frameCount % 4 === 0) {
          setEpoch(s.epoch);
          setDispLoss(s.losses[s.losses.length - 1]);
          setDispAcc(s.accs[s.accs.length - 1]);
        }
      }

      frameCount++;

      // Draw all canvases
      const bc = boundaryRef.current;
      const nc = netRef.current;
      const cc = chartRef.current;
      if (bc) renderBoundary(bc.getContext("2d")!, s.net, s.data, actRef.current, bc.width, bc.height);
      if (nc) renderNetwork(nc.getContext("2d")!, s.net, s.sampleActs, nc.width, nc.height);
      if (cc) renderChart(cc.getContext("2d")!, s.losses, s.accs, cc.width, cc.height);

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── UI ──────────────────────────────────────────────────────────────────
  const selectStyle: React.CSSProperties = {
    background: "#12122a",
    color: "#ccd",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  };

  const labelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "rgba(190,200,255,0.6)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#07071a 0%,#0d0d2b 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "20px 16px",
        fontFamily: 'ui-monospace,"Cascadia Code","JetBrains Mono",monospace',
        color: "#ccd",
      }}
    >
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: "center" }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: 2,
            background: "linear-gradient(90deg,#ff6b9d,#c77dff,#48cae4)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Neural Network — Live Training
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: "rgba(160,170,220,0.4)" }}>
          スパイラル2クラス分類 &nbsp;·&nbsp; 2層MLP &nbsp;·&nbsp; ミニバッチSGD (batch=32)
        </p>
      </motion.div>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 28,
          fontSize: 12,
          padding: "6px 20px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span>
          Epoch&nbsp;<strong style={{ color: "#c77dff" }}>{epoch.toLocaleString()}</strong>
        </span>
        <span>
          Loss&nbsp;<strong style={{ color: "#ff6b6b" }}>{dispLoss.toFixed(4)}</strong>
        </span>
        <span>
          Accuracy&nbsp;<strong style={{ color: "#48cae4" }}>{(dispAcc * 100).toFixed(1)}%</strong>
        </span>
      </div>

      {/* Canvases */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}
      >
        {/* Decision boundary */}
        <div>
          <div style={{ fontSize: 10, color: "rgba(150,160,210,0.45)", marginBottom: 4 }}>
            Decision Boundary &nbsp;
            <span style={{ color: "#ff6060" }}>● class 0</span>
            &nbsp;
            <span style={{ color: "#5090ff" }}>● class 1</span>
          </div>
          <canvas
            ref={boundaryRef}
            width={380}
            height={380}
            style={{ borderRadius: 12, display: "block", border: "1px solid rgba(100,120,255,0.18)" }}
          />
        </div>

        {/* Network + Chart */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(150,160,210,0.45)", marginBottom: 4 }}>
              Network Weights &amp; Activations
              &nbsp;<span style={{ color: "rgba(80,140,255,0.6)" }}>─ positive</span>
              &nbsp;<span style={{ color: "rgba(255,80,100,0.6)" }}>─ negative</span>
            </div>
            <canvas
              ref={netRef}
              width={370}
              height={222}
              style={{ borderRadius: 12, display: "block", border: "1px solid rgba(100,120,255,0.18)" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(150,160,210,0.45)", marginBottom: 4 }}>
              <span style={{ color: "#ff6b6b" }}>── Loss</span>
              &nbsp;&nbsp;
              <span style={{ color: "#48cae4" }}>── Accuracy</span>
            </div>
            <canvas
              ref={chartRef}
              width={370}
              height={130}
              style={{ borderRadius: 12, display: "block", border: "1px solid rgba(100,120,255,0.18)" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          background: "rgba(255,255,255,0.04)",
          padding: "12px 20px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.93 }}
          whileHover={{ scale: 1.04 }}
          onClick={() => setIsRunning((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: isRunning
              ? "linear-gradient(135deg,rgba(255,70,90,0.9),rgba(200,40,60,0.9))"
              : "linear-gradient(135deg,rgba(60,110,255,0.9),rgba(100,60,220,0.9))",
            color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit",
            boxShadow: isRunning ? "0 0 16px rgba(255,70,90,0.3)" : "0 0 16px rgba(60,110,255,0.3)",
            transition: "background 0.2s, box-shadow 0.2s",
          }}
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          {isRunning ? "停止" : "学習開始"}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={handleReset}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.13)",
            background: "transparent", color: "#aab", cursor: "pointer",
            fontSize: 13, fontFamily: "inherit",
          }}
        >
          <RotateCcw size={13} />
          リセット
        </motion.button>

        <label style={labelStyle}>
          学習率
          <select value={lr} onChange={(e) => setLr(+e.target.value)} style={selectStyle}>
            {[0.001, 0.003, 0.01, 0.03, 0.1, 0.3].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          活性化関数
          <select value={actKey} onChange={(e) => setActKey(e.target.value as ActKey)} style={selectStyle}>
            <option value="relu">ReLU</option>
            <option value="tanh">Tanh</option>
            <option value="sigmoid">Sigmoid</option>
          </select>
        </label>

        <label style={labelStyle}>
          隠れ層ノード数
          <select value={hiddenSize} onChange={(e) => setHiddenSize(+e.target.value)} style={selectStyle}>
            {[4, 8, 16, 32].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      </motion.div>
    </div>
  );
}
