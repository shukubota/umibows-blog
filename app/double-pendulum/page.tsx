"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function DoublePendulumPage() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);

    // Physics parameters state
    // l1, l2: rod lengths
    // m1, m2: masses
    // g: gravity
    const [params, setParams] = useState({
        l1: 150,
        l2: 150,
        m1: 20,
        m2: 20,
        g: 0.5,
    });

    // Simulation state
    // theta: angle, omega: angular velocity
    const stateRef = useRef({
        theta1: Math.PI / 2,
        theta2: Math.PI / 2,
        omega1: 0,
        omega2: 0,
    });

    const pathRef = useRef<{ x: number; y: number }[]>([]);

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
            // Clear canvas with trail effect
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.fillRect(0, 0, width, height);

            const { l1, l2, m1, m2, g } = params;
            let { theta1, theta2, omega1, omega2 } = stateRef.current;

            if (isPlaying) {
                // Runge-Kutta or simple symplectic integration could correspond here.
                // For simplicity and stability in a visual demo, we can use a direct formula implementation 
                // derived from the Lagrangian equations of motion for a double pendulum.
                // 
                // omega1_dot = ...
                // omega2_dot = ...

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

                // Damping (friction)
                omega1 *= 0.999;
                omega2 *= 0.999;

                theta1 += omega1;
                theta2 += omega2;

                stateRef.current = { theta1, theta2, omega1, omega2 };
            }

            // Calculate positions
            const x1 = centerX + l1 * Math.sin(theta1);
            const y1 = centerY + l1 * Math.cos(theta1);

            const x2 = x1 + l2 * Math.sin(theta2);
            const y2 = y1 + l2 * Math.cos(theta2);

            // Store path for trace
            if (isPlaying) {
                pathRef.current.push({ x: x2, y: y2 });
                if (pathRef.current.length > 200) {
                    pathRef.current.shift();
                }
            }

            // Draw Path
            if (pathRef.current.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = "rgba(0, 0, 255, 0.2)";
                ctx.lineWidth = 2;
                ctx.moveTo(pathRef.current[0].x, pathRef.current[0].y);
                for (let i = 1; i < pathRef.current.length; i++) {
                    ctx.lineTo(pathRef.current[i].x, pathRef.current[i].y);
                }
                ctx.stroke();
            }

            // Draw Rods
            ctx.beginPath();
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 4;
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Draw Joint 1
            ctx.beginPath();
            ctx.fillStyle = "#FF5722";
            ctx.arc(x1, y1, m1 / 2, 0, 2 * Math.PI);
            ctx.fill();

            // Draw Joint 2
            ctx.beginPath();
            ctx.fillStyle = "#2196F3";
            ctx.arc(x2, y2, m2 / 2, 0, 2 * Math.PI);
            ctx.fill();

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
        stateRef.current = {
            theta1: Math.PI / 2 + Math.random() * 0.5,
            theta2: Math.PI / 2 + Math.random() * 0.5,
            omega1: 0,
            omega2: 0,
        };
        pathRef.current = [];
        setIsPlaying(true);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col items-center">
                <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">Double Pendulum Simulation</h1>

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
