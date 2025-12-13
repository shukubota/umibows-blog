"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type PendulumState = {
    theta1: number;
    theta2: number;
    omega1: number;
    omega2: number;
    color: string;
};

export default function DoublePendulumPage() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);

    // Physics parameters
    const [params] = useState({
        l1: 150,
        l2: 150,
        m1: 10,
        m2: 10,
        g: 0.8,
    });

    const NUM_PENDULUMS = 50; // Increased number for better chaos visualization
    const statesRef = useRef<PendulumState[]>([]);

    // Initialize function
    const initializePendulums = () => {
        const baseState = {
            theta1: Math.PI / 2 + 0.1,
            theta2: Math.PI / 2 + 0.1,
            omega1: 0,
            omega2: 0
        };

        const newStates: PendulumState[] = [];
        for (let i = 0; i < NUM_PENDULUMS; i++) {
            // Perturb slightly (1e-4)
            const perturbation = i * 0.00001;
            newStates.push({
                theta1: baseState.theta1 + perturbation,
                theta2: baseState.theta2 + perturbation,
                omega1: baseState.omega1,
                omega2: baseState.omega2,
                // Color gradient from Red to Violet
                color: `hsl(${280 * (i / NUM_PENDULUMS)}, 100%, 50%)`
            });
        }
        statesRef.current = newStates;
    };

    // Initialize on mount
    useEffect(() => {
        if (statesRef.current.length === 0) {
            initializePendulums();
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 3;

        const render = () => {
            // Clear canvas completely - NO TRAIL
            ctx.clearRect(0, 0, width, height);

            const { l1, l2, m1, m2, g } = params;

            if (isPlaying) {
                // Update all pendulums
                for (let i = 0; i < statesRef.current.length; i++) {
                    let { theta1, theta2, omega1, omega2 } = statesRef.current[i];

                    const num1 = -g * (2 * m1 + m2) * Math.sin(theta1);
                    const num2 = -m2 * g * Math.sin(theta1 - 2 * theta2);
                    const num3 = -2 * Math.sin(theta1 - theta2) * m2;
                    const num4 = omega2 * omega2 * l2 + omega1 * omega1 * l1 * Math.cos(theta1 - theta2);
                    const den = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * theta1 - 2 * theta2));

                    const alpha1 = (num1 + num2 + num3 * num4) / den;

                    const num5 = 2 * Math.sin(theta1 - theta2);
                    const num6 = omega1 * omega1 * l1 * (m1 + m2);
                    const num7 = g * (m1 + m2) * Math.cos(theta1);
                    const num8 = omega2 * omega2 * l2 * m2 * Math.cos(theta1 - theta2);
                    const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * theta1 - 2 * theta2));

                    const alpha2 = (num5 * (num6 + num7 + num8)) / den2;

                    omega1 += alpha1;
                    omega2 += alpha2;

                    // Minimal damping
                    omega1 *= 0.9995;
                    omega2 *= 0.9995;

                    theta1 += omega1;
                    theta2 += omega2;

                    statesRef.current[i] = { ...statesRef.current[i], theta1, theta2, omega1, omega2 };
                }
            }

            // Draw all pendulums
            // We draw them with somewhat transparency so they blend
            ctx.lineWidth = 2;

            for (let i = 0; i < statesRef.current.length; i++) {
                const s = statesRef.current[i];
                const x1 = centerX + l1 * Math.sin(s.theta1);
                const y1 = centerY + l1 * Math.cos(s.theta1);

                const x2 = x1 + l2 * Math.sin(s.theta2);
                const y2 = y1 + l2 * Math.cos(s.theta2);

                ctx.strokeStyle = s.color;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                // Small joints
                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.arc(x2, y2, 3, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Draw Pivot
            ctx.beginPath();
            ctx.fillStyle = "#000";
            ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
            ctx.fill();

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, params]);

    const handleReset = () => {
        initializePendulums();
        setIsPlaying(true);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col items-center">
                <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-100">Butterfly Effect Demo</h1>
                <p className="mb-6 text-gray-600 dark:text-gray-400">
                    Simulating {NUM_PENDULUMS} double pendulums with tiny initial differences (10^-5 rad).
                    Watch chaos emerge.
                </p>

                <div className="relative border rounded-lg overflow-hidden bg-white shadow-inner mb-6">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={600}
                        className="block bg-white"
                    />
                </div>

                <div className="flex gap-4 mb-6">
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
                </div>

                <Link href="/" className="text-blue-500 hover:underline">
                    &larr; Back to Home
                </Link>
            </div>
        </main>
    );
}
