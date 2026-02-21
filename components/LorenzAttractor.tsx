"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface Point {
  x: number;
  y: number;
  z: number;
}

const LorenzAttractor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [sigma, setSigma] = useState(10);
  const [rho, setRho] = useState(28);
  const [beta, setBeta] = useState(8 / 3);
  const [speed, setSpeed] = useState(1);
  const [isControlsOpen, setIsControlsOpen] = useState(true);

  // Simulation state
  const pointsRef = useRef<Point[]>([]);
  const currentPosRef = useRef<Point>({ x: 0.1, y: 0, z: 0 });
  const requestRef = useRef<number>();

  const resetSimulation = () => {
    pointsRef.current = [];
    currentPosRef.current = { x: 0.1, y: 0, z: 0 };
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const rk4 = useCallback(
    (p: Point, dt: number): Point => {
      const f = (p: Point): Point => ({
        x: sigma * (p.y - p.x),
        y: p.x * (rho - p.z) - p.y,
        z: p.x * p.y - beta * p.z,
      });

      const k1 = f(p);
      const k2 = f({
        x: p.x + k1.x * dt * 0.5,
        y: p.y + k1.y * dt * 0.5,
        z: p.z + k1.z * dt * 0.5,
      });
      const k3 = f({
        x: p.x + k2.x * dt * 0.5,
        y: p.y + k2.y * dt * 0.5,
        z: p.z + k2.z * dt * 0.5,
      });
      const k4 = f({ x: p.x + k3.x * dt, y: p.y + k3.y * dt, z: p.z + k3.z * dt });

      return {
        x: p.x + ((k1.x + 2 * k2.x + 2 * k3.x + k4.x) * dt) / 6,
        y: p.y + ((k1.y + 2 * k2.y + 2 * k3.y + k4.y) * dt) / 6,
        z: p.z + ((k1.z + 2 * k2.z + 2 * k3.z + k4.z) * dt) / 6,
      };
    },
    [sigma, rho, beta]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // No fade effect - keep previous paths
    // ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 + 100; // Shift down slightly
    const scale = 12;

    const iterations = Math.ceil(speed * 2);

    ctx.beginPath();
    // Start from last drawn point if available
    if (pointsRef.current.length > 0) {
      const last = pointsRef.current[pointsRef.current.length - 1];
      ctx.moveTo(centerX + last.x * scale, centerY - last.z * scale);
    } else {
      ctx.moveTo(
        centerX + currentPosRef.current.x * scale,
        centerY - currentPosRef.current.z * scale
      );
    }

    for (let i = 0; i < iterations; i++) {
      const nextPos = rk4(currentPosRef.current, 0.005);
      currentPosRef.current = nextPos;
      pointsRef.current.push(nextPos);

      // Limit points history for memory, though we are drawing immediately
      if (pointsRef.current.length > 10000) {
        pointsRef.current.shift();
      }

      // Color based on Z height or velocity could be cool, simple gradient for now
      // Using HSL for rainbow effect based on valid Z range approx 0-50
      const hue = (nextPos.z * 5) % 360;
      ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
      ctx.lineTo(centerX + nextPos.x * scale, centerY - nextPos.z * scale);
    }

    ctx.lineWidth = 1;
    ctx.stroke();

    requestRef.current = requestAnimationFrame(draw);
  }, [speed, rk4]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, sigma, rho, beta, speed, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Clear on resize to avoid stretching
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Equations Panel (Right Side) */}
      <div className="absolute top-4 right-4 p-4 bg-gray-900/30 text-white rounded-xl border border-white/5 backdrop-blur-sm pointer-events-none select-none">
        <div className="font-mono text-sm opacity-80 space-y-1">
          <div>
            <span className="text-green-400">dx/dt</span> = σ(y - x)
          </div>
          <div>
            <span className="text-blue-400">dy/dt</span> = x(ρ - z) - y
          </div>
          <div>
            <span className="text-pink-400">dz/dt</span> = xy - βz
          </div>
        </div>
      </div>

      {/* Toggle Button for Controls */}
      <button
        onClick={() => setIsControlsOpen(!isControlsOpen)}
        className="absolute top-4 left-4 z-20 p-2 bg-gray-900/50 hover:bg-gray-800/80 text-white rounded-full transition-colors backdrop-blur-sm border border-white/10"
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

      {/* Controls Panel */}
      <div
        className={`absolute top-4 left-4 p-6 w-80 bg-gray-900/90 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-2xl transition-all duration-300 transform origin-top-left ${
          isControlsOpen
            ? "scale-100 opacity-100 translate-y-12"
            : "scale-95 opacity-0 pointer-events-none translate-y-0"
        }`}
      >
        <h2 className="text-xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Lorenz Attractor
        </h2>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Speed</span>
              <span>{speed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-blue-400 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Sigma (σ)</span>
              <span className="text-green-400">{sigma}</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={sigma}
              onChange={(e) => setSigma(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Rho (ρ)</span>
              <span className="text-blue-400">{rho}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={rho}
              onChange={(e) => setRho(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Beta (β)</span>
              <span className="text-pink-400">{beta.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <div className="flex justify-center space-x-4 pt-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
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
              onClick={resetSimulation}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
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

export default LorenzAttractor;
