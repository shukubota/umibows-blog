"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function NumericalComparisonPage() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [dt, setDt] = useState(0.1); // Time step

    // Physics parameters for Simple Harmonic Oscillator (SHO)
    // dx/dt = v
    // dv/dt = -k/m * x
    const k = 1.0;
    const m = 1.0;
    const omega = Math.sqrt(k / m);

    // Initial conditions
    const x0 = 200; // Amplitude (pixels from center)
    const v0 = 0;

    // State
    const stateRef = useRef({
        t: 0,
        euler: { x: x0, v: v0 },
        rk4: { x: x0, v: v0 },
        analytical: { x: x0, v: v0 },
    });

    const historyRef = useRef<{ t: number, euler: number, rk4: number, analytical: number }[]>([]);

    // Derivatives function for SHO
    const derivatives = (x: number, v: number) => {
        return {
            dx: v,
            dv: -(k / m) * x
        };
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            let { t, euler, rk4, analytical } = stateRef.current;

            if (isPlaying) {
                // --- Euler Method ---
                // x_new = x + v * dt
                // v_new = v + a * dt
                const a_euler = -(k / m) * euler.x;
                const euler_x_new = euler.x + euler.v * dt;
                const euler_v_new = euler.v + a_euler * dt;
                euler = { x: euler_x_new, v: euler_v_new };


                // --- RK4 Method ---
                // k1
                const k1 = derivatives(rk4.x, rk4.v);
                // k2
                const k2 = derivatives(rk4.x + k1.dx * dt * 0.5, rk4.v + k1.dv * dt * 0.5);
                // k3
                const k3 = derivatives(rk4.x + k2.dx * dt * 0.5, rk4.v + k2.dv * dt * 0.5);
                // k4
                const k4 = derivatives(rk4.x + k3.dx * dt, rk4.v + k3.dv * dt);

                const rk4_x_new = rk4.x + (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx) * (dt / 6);
                const rk4_v_new = rk4.v + (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv) * (dt / 6);
                rk4 = { x: rk4_x_new, v: rk4_v_new };

                // --- Analytical Solution ---
                t += dt;
                // x(t) = x0 * cos(omega * t) + (v0/omega) * sin(omega * t)
                const ana_x = x0 * Math.cos(omega * t) + (v0 / omega) * Math.sin(omega * t);
                const ana_v = -x0 * omega * Math.sin(omega * t) + v0 * Math.cos(omega * t);
                analytical = { x: ana_x, v: ana_v };

                stateRef.current = { t, euler, rk4, analytical };

                // Store history for graphing (keep last 300 points)
                historyRef.current.push({ t, euler: euler.x, rk4: rk4.x, analytical: analytical.x });
                if (historyRef.current.length > 300) {
                    historyRef.current.shift();
                }
            }

            // --- Visualization ---

            // 1. Draw Oscillators (Top half)
            const spacing = 100;

            // Labels
            ctx.fillStyle = "#333";
            ctx.font = "16px sans-serif";

            // Euler (Red)
            const eulerY = centerY - 150;
            ctx.fillStyle = "red";
            ctx.fillText(`Euler (dt=${dt})`, 50, eulerY);
            ctx.beginPath();
            ctx.arc(centerX + euler.x, eulerY, 15, 0, 2 * Math.PI);
            ctx.fill();
            // Spring line
            ctx.beginPath(); ctx.strokeStyle = "#aaa"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, eulerY); ctx.lineTo(centerX + euler.x, eulerY); ctx.stroke();
            // Vertical barrier line
            ctx.beginPath(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, eulerY - 30); ctx.lineTo(centerX, eulerY + 30); ctx.stroke();


            // RK4 (Blue)
            const rk4Y = centerY - 80;
            ctx.fillStyle = "blue";
            ctx.fillText("RK4", 50, rk4Y);
            ctx.beginPath();
            ctx.arc(centerX + rk4.x, rk4Y, 15, 0, 2 * Math.PI);
            ctx.fill();
            // Spring line
            ctx.beginPath(); ctx.strokeStyle = "#aaa"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, rk4Y); ctx.lineTo(centerX + rk4.x, rk4Y); ctx.stroke();
            // Vertical barrier
            ctx.beginPath(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, rk4Y - 30); ctx.lineTo(centerX, rk4Y + 30); ctx.stroke();


            // Analytical (Green)
            const anaY = centerY - 10;
            ctx.fillStyle = "green";
            ctx.fillText("Analytical (Exact)", 50, anaY);
            ctx.beginPath();
            ctx.arc(centerX + analytical.x, anaY, 15, 0, 2 * Math.PI);
            ctx.fill();
            // Spring line
            ctx.beginPath(); ctx.strokeStyle = "#aaa"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, anaY); ctx.lineTo(centerX + analytical.x, anaY); ctx.stroke();
            // Vertical barrier
            ctx.beginPath(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
            ctx.moveTo(centerX, anaY - 30); ctx.lineTo(centerX, anaY + 30); ctx.stroke();


            // 2. Draw Graph (Bottom half)
            const graphY = centerY + 100;
            const graphHeight = 150;
            const graphWidth = width - 100;

            ctx.strokeStyle = "#ddd";
            ctx.strokeRect(50, graphY, graphWidth, graphHeight);

            // Center line
            ctx.beginPath();
            ctx.strokeStyle = "#eee";
            ctx.moveTo(50, graphY + graphHeight / 2);
            ctx.lineTo(50 + graphWidth, graphY + graphHeight / 2);
            ctx.stroke();

            const drawPath = (dataKey: 'euler' | 'rk4' | 'analytical', color: string) => {
                if (historyRef.current.length < 2) return;
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;

                for (let i = 0; i < historyRef.current.length; i++) {
                    const point = historyRef.current[i];
                    const px = 50 + (i / historyRef.current.length) * graphWidth;
                    // Map x (-300 to 300) to graph height
                    const py = graphY + graphHeight / 2 - (point[dataKey] / 400) * (graphHeight / 2);

                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            };

            // Draw paths
            // Draw Euler first (so others appear on top if they match)
            drawPath('euler', 'rgba(255, 0, 0, 0.5)');
            drawPath('rk4', 'rgba(0, 0, 255, 0.5)');
            drawPath('analytical', 'rgba(0, 128, 0, 0.5)');


            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, dt]);

    const handleReset = () => {
        stateRef.current = {
            t: 0,
            euler: { x: x0, v: v0 },
            rk4: { x: x0, v: v0 },
            analytical: { x: x0, v: v0 },
        };
        historyRef.current = [];
        setIsPlaying(true);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col items-center">
                <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-100">Numerical Integration Comparison</h1>
                <p className="mb-6 text-gray-600 dark:text-gray-400">
                    Comparing Euler's Method, Runge-Kutta 4 (RK4), and Analytical Solution for a Harmonic Oscillator.
                    Notice how Euler diverges (adds energy) over time, while RK4 stays accurate.
                </p>

                <div className="relative border rounded-lg overflow-hidden bg-white shadow-inner mb-6">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={500}
                        className="block bg-white"
                    />
                </div>

                <div className="flex gap-4 mb-6 items-center">
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                    >
                        {isPlaying ? "Pause" : "Resume"}
                    </button>
                    <button
                        onClick={handleReset}
                        className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                    >
                        Reset
                    </button>

                    <div className="flex items-center gap-2 ml-4">
                        <label className="text-gray-700 dark:text-gray-300 font-medium">Step Size (dt):</label>
                        <input
                            type="range"
                            min="0.01"
                            max="0.5"
                            step="0.01"
                            value={dt}
                            onChange={(e) => {
                                setDt(parseFloat(e.target.value));
                                handleReset();
                            }}
                            className="w-32"
                        />
                        <span className="text-gray-600 dark:text-gray-400 font-mono w-12">{dt.toFixed(2)}</span>
                    </div>
                </div>

                <Link href="/" className="text-blue-500 hover:underline">
                    &larr; Back to Home
                </Link>
            </div>
        </main>
    );
}
