"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface Body {
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  color: string;
  radius: number;
  label?: string;
  trail: { x: number; y: number }[];
}

type PresetId = "solar" | "binary" | "three-body" | "slingshot";

interface Preset {
  id: PresetId;
  name: string;
  description: string;
  // World units; canvas is centered at (0,0) with the configured worldScale.
  worldScale: number; // pixels per world unit
  G: number;
  // Softening^2 in world units. Avoids singular forces at close approach.
  // Must be small relative to typical body separations or gravity gets neutered.
  softening2: number;
  // Per-frame integration timestep in world units, scaled by Speed slider.
  dt: number;
  build: () => Body[];
}

const TRAIL_LIMIT = 600;

const makeBody = (
  mass: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
  radius: number,
  label?: string
): Body => ({
  mass,
  x,
  y,
  vx,
  vy,
  ax: 0,
  ay: 0,
  color,
  radius,
  label,
  trail: [],
});

// Circular orbit velocity around a central mass at distance r: v = sqrt(G * M / r).
const orbitVelocity = (G: number, centralMass: number, r: number) =>
  Math.sqrt((G * centralMass) / r);

const PRESETS: Preset[] = [
  {
    id: "solar",
    name: "Solar System",
    description: "中心星のまわりを4つの惑星が安定して公転",
    worldScale: 0.8,
    G: 1,
    softening2: 4,
    dt: 0.05,
    build: () => {
      const G = 1;
      const M = 2000;
      const bodies: Body[] = [makeBody(M, 0, 0, 0, 0, "#facc15", 14, "Sun")];
      const planets = [
        { r: 80, m: 2, c: "#60a5fa", label: "I" },
        { r: 140, m: 3, c: "#34d399", label: "II" },
        { r: 220, m: 4, c: "#f472b6", label: "III" },
        { r: 320, m: 2, c: "#a78bfa", label: "IV" },
      ];
      planets.forEach((p) => {
        const v = orbitVelocity(G, M, p.r);
        bodies.push(makeBody(p.m, p.r, 0, 0, v, p.c, 5, p.label));
      });
      return bodies;
    },
  },
  {
    id: "binary",
    name: "Binary Star + Planet",
    description: "連星のまわりを惑星が周回するP型軌道",
    worldScale: 0.7,
    G: 1,
    softening2: 4,
    dt: 0.05,
    build: () => {
      const G = 1;
      const M = 1000;
      const sep = 80;
      // Two equal-mass stars orbiting their barycenter at (0,0).
      const r = sep / 2;
      const v = Math.sqrt((G * M) / (4 * r)); // each star sees the other at distance 2r
      const bodies: Body[] = [
        makeBody(M, -r, 0, 0, -v, "#fb923c", 11, "A"),
        makeBody(M, r, 0, 0, v, "#fbbf24", 11, "B"),
      ];
      // Distant planet on a P-type orbit (treats binary as a point mass of 2M).
      const planetR = 280;
      const vp = orbitVelocity(G, 2 * M, planetR);
      bodies.push(makeBody(3, 0, planetR, -vp, 0, "#38bdf8", 5, "P"));
      return bodies;
    },
  },
  {
    id: "three-body",
    name: "Three-Body (Figure-8)",
    description: "Chenciner-Montgomery の8の字解 — 3体が共通の軌道を辿る",
    worldScale: 110,
    G: 1,
    softening2: 0,
    dt: 0.005,
    build: () => {
      // Classic Figure-8 initial conditions (G = 1, m = 1)
      // From Chenciner & Montgomery 2000.
      const p1x = 0.97000436;
      const p1y = -0.24308753;
      const v3x = -0.93240737;
      const v3y = -0.86473146;
      const bodies: Body[] = [
        makeBody(1, p1x, p1y, -v3x / 2, -v3y / 2, "#f87171", 6, "1"),
        makeBody(1, -p1x, -p1y, -v3x / 2, -v3y / 2, "#60a5fa", 6, "2"),
        makeBody(1, 0, 0, v3x, v3y, "#a3e635", 6, "3"),
      ];
      return bodies;
    },
  },
  {
    id: "slingshot",
    name: "Gravity Assist",
    description: "重い惑星のそばを通過して速度を得るスリングショット",
    worldScale: 1.0,
    G: 1,
    softening2: 9,
    dt: 0.03,
    build: () => {
      const bodies: Body[] = [
        makeBody(3000, 0, 0, 0, 0, "#facc15", 16, "Sun"),
        // Large planet on a wide orbit
        makeBody(80, 220, 0, 0, orbitVelocity(1, 3000, 220), "#60a5fa", 9, "Jupiter"),
        // Light probe on a hyperbolic trajectory toward the planet
        makeBody(0.01, -350, 60, 4.2, 0.4, "#f9fafb", 3, "Probe"),
      ];
      return bodies;
    },
  },
];

// Compute accelerations for all bodies under mutual gravity with a softening term.
const computeAccelerations = (bodies: Body[], gravity: number, eps2: number) => {
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].ax = 0;
    bodies[i].ay = 0;
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + eps2;
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR / r2;
      const f = gravity * invR3;
      bodies[i].ax += f * bodies[j].mass * dx;
      bodies[i].ay += f * bodies[j].mass * dy;
      bodies[j].ax -= f * bodies[i].mass * dx;
      bodies[j].ay -= f * bodies[i].mass * dy;
    }
  }
};

// Velocity Verlet: symplectic, conserves orbital energy far better than RK4 here.
const step = (bodies: Body[], dt: number, gravity: number, eps2: number) => {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
    b.y += b.vy * dt + 0.5 * b.ay * dt * dt;
  }
  const prevAx = bodies.map((b) => b.ax);
  const prevAy = bodies.map((b) => b.ay);
  computeAccelerations(bodies, gravity, eps2);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += 0.5 * (prevAx[i] + b.ax) * dt;
    b.vy += 0.5 * (prevAy[i] + b.ay) * dt;
  }
};

const PlanetMotion: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>("solar");
  const [isPlaying, setIsPlaying] = useState(true);
  const [timeScale, setTimeScale] = useState(1);
  const [G, setG] = useState(1);
  const [showTrails, setShowTrails] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [isControlsOpen, setIsControlsOpen] = useState(true);

  const [bodyCount, setBodyCount] = useState(0);

  const bodiesRef = useRef<Body[]>([]);
  const worldScaleRef = useRef<number>(0.8);
  const softening2Ref = useRef<number>(4);
  const baseDtRef = useRef<number>(0.05);
  const isPlayingRef = useRef<boolean>(true);
  const timeScaleRef = useRef<number>(1);
  const gRef = useRef<number>(1);
  const showTrailsRef = useRef<boolean>(true);
  const showLabelsRef = useRef<boolean>(true);

  // Mirror state into refs so the render loop reads latest values without restarting.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);
  useEffect(() => {
    gRef.current = G;
  }, [G]);
  useEffect(() => {
    showTrailsRef.current = showTrails;
  }, [showTrails]);
  useEffect(() => {
    showLabelsRef.current = showLabels;
  }, [showLabels]);

  const loadPreset = useCallback((id: PresetId) => {
    const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
    bodiesRef.current = preset.build();
    worldScaleRef.current = preset.worldScale;
    softening2Ref.current = preset.softening2;
    baseDtRef.current = preset.dt;
    gRef.current = preset.G;
    setG(preset.G);
    setBodyCount(bodiesRef.current.length);
  }, []);

  // Initialize bodies when preset changes.
  useEffect(() => {
    loadPreset(presetId);
  }, [presetId, loadPreset]);

  const handleReset = () => {
    loadPreset(presetId);
    setIsPlaying(true);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const scale = worldScaleRef.current;

    // Background — faint trail fade if trails enabled, full clear otherwise.
    if (showTrailsRef.current) {
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.fillStyle = "#000";
    }
    ctx.fillRect(0, 0, width, height);

    if (isPlayingRef.current) {
      const bodies = bodiesRef.current;
      const eps2 = softening2Ref.current;
      // Ensure accelerations are initialized once before first step.
      if (bodies.length > 0 && bodies.every((b) => b.ax === 0 && b.ay === 0)) {
        computeAccelerations(bodies, gRef.current, eps2);
      }
      const ts = timeScaleRef.current;
      const substeps = Math.max(1, Math.ceil(ts * 4));
      const dt = (baseDtRef.current * ts) / substeps;
      for (let s = 0; s < substeps; s++) {
        step(bodies, dt, gRef.current, eps2);
      }
      // Record trails after stepping.
      for (const b of bodies) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > TRAIL_LIMIT) b.trail.shift();
      }
    }

    const bodies = bodiesRef.current;

    // Draw trails
    if (showTrailsRef.current) {
      for (const b of bodies) {
        if (b.trail.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i++) {
          const p = b.trail[i];
          const px = cx + p.x * scale;
          const py = cy + p.y * scale;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = b.color + "66"; // semi-transparent
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Draw bodies
    for (const b of bodies) {
      const px = cx + b.x * scale;
      const py = cy + b.y * scale;

      // Glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, b.radius * 3);
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, b.color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, b.radius * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(px, py, b.radius, 0, Math.PI * 2);
      ctx.fill();

      if (showLabelsRef.current && b.label) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(b.label, px + b.radius + 4, py - b.radius - 4);
      }
    }
  }, []);

  // Single animation loop. Uses a local `running` flag so a leaked frame after
  // unmount (e.g. Strict Mode double-mount) cannot resurrect the loop.
  useEffect(() => {
    let running = true;
    let rafId = 0;
    const tick = () => {
      if (!running) return;
      draw();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [draw]);

  // Resize canvas to viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Equation panel */}
      <div className="absolute top-4 right-4 p-4 bg-gray-900/30 text-white rounded-xl border border-white/5 backdrop-blur-sm pointer-events-none select-none">
        <div className="font-mono text-sm opacity-80 space-y-1">
          <div>
            <span className="text-yellow-400">F</span> = G · m₁ · m₂ / r²
          </div>
          <div className="text-xs opacity-70">
            integrator: velocity Verlet · bodies: {bodyCount}
          </div>
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setIsControlsOpen(!isControlsOpen)}
        className="absolute top-4 left-4 z-20 p-2 bg-gray-900/50 hover:bg-gray-800/80 text-white rounded-full transition-colors backdrop-blur-sm border border-white/10"
        aria-label="Toggle controls"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="24"
          viewBox="0 -960 960 960"
          width="24"
          fill="currentColor"
        >
          <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
        </svg>
      </button>

      {/* Controls */}
      <div
        className={`absolute top-4 left-4 p-6 w-80 bg-gray-900/90 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-2xl transition-all duration-300 transform origin-top-left ${
          isControlsOpen
            ? "scale-100 opacity-100 translate-y-12"
            : "scale-95 opacity-0 pointer-events-none translate-y-0"
        }`}
      >
        <h2 className="text-xl font-bold mb-1 bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent">
          Planetary Motion
        </h2>
        <p className="text-xs text-gray-400 mb-5">{preset.description}</p>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs text-gray-400">Preset</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className={`px-2 py-2 text-xs rounded-lg border transition-colors ${
                    p.id === presetId
                      ? "bg-white/20 border-white/40"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Speed</span>
              <span>{timeScale.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={timeScale}
              onChange={(e) => setTimeScale(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Gravity (G)</span>
              <span className="text-amber-300">{G.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={G}
              onChange={(e) => setG(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrails}
                onChange={(e) => setShowTrails(e.target.checked)}
                className="accent-amber-400"
              />
              Trails
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="accent-amber-400"
              />
              Labels
            </label>
          </div>

          <div className="flex justify-center space-x-4 pt-1">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24"
                  viewBox="0 -960 960 960"
                  width="24"
                  fill="currentColor"
                >
                  <path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24"
                  viewBox="0 -960 960 960"
                  width="24"
                  fill="currentColor"
                >
                  <path d="M320-200v-560l440 280-440 280Z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleReset}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
              aria-label="Reset"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24"
                viewBox="0 -960 960 960"
                width="24"
                fill="currentColor"
              >
                <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanetMotion;
