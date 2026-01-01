'use client';

import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { generateTexFromImage } from './actions';

export default function TexPage() {
    const [input, setInput] = useState('\\frac{1}{2}');
    const [html, setHtml] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Camera state
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        try {
            const rendered = katex.renderToString(input, {
                throwOnError: true,
                displayMode: true,
            });
            setHtml(rendered);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    }, [input]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
            setIsCameraOpen(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
            setError("Could not access camera. Please allow permissions.");
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    const captureImage = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get base64 data
        const imageData = canvas.toDataURL('image/jpeg');

        stopCamera();
        setIsProcessing(true);
        setError(null);

        try {
            const result = await generateTexFromImage(imageData);
            if (result.error) {
                setError(result.error);
            } else if (result.tex) {
                setInput(result.tex);
            }
        } catch (err) {
            console.error("Error processing image:", err);
            setError("Failed to process image.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                        TeX Previewer
                    </h1>
                    <p className="text-gray-400">
                        Type LaTeX math expressions below to see them rendered in real-time.
                    </p>
                </header>

                {/* Camera Section */}
                <section className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-blue-300">Handwriting Recognition (Beta)</h2>
                        {!isCameraOpen && !isProcessing && (
                            <button
                                onClick={startCamera}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                </svg>
                                Scan from Camera
                            </button>
                        )}
                        {isCameraOpen && (
                            <button
                                onClick={stopCamera}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                    {isCameraOpen && (
                        <div className="relative w-full max-w-md mx-auto aspect-video bg-black rounded-lg overflow-hidden mb-4">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                <button
                                    onClick={captureImage}
                                    className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-lg hover:bg-gray-100 transition-transform active:scale-95 flex items-center justify-center"
                                    aria-label="Capture"
                                >
                                    <div className="w-12 h-12 bg-red-500 rounded-full"></div>
                                </button>
                            </div>
                        </div>
                    )}

                    {isProcessing && (
                        <div className="flex flex-col items-center justify-center py-8 text-blue-300 animate-pulse">
                            <svg className="w-8 h-8 mb-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p>Processing image with Gemini AI...</p>
                        </div>
                    )}

                    {/* Hidden Canvas for Capture */}
                    <canvas ref={canvasRef} className="hidden" />
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Input Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-semibold text-blue-300">Input</h2>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full h-64 p-4 bg-gray-800 text-gray-200 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-none transition-all"
                            placeholder="Enter LaTeX here... e.g., \int_{-\infty}^{\infty} e^{-x^2} dx"
                            spellCheck={false}
                        />
                        {error && (
                            <div className="p-4 bg-red-900/50 border border-red-500/30 rounded-lg text-red-200 text-sm overflow-x-auto">
                                <span className="font-bold block mb-1">Error:</span>
                                {error}
                            </div>
                        )}
                    </section>

                    {/* Preview Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-semibold text-teal-300">Preview</h2>
                        <div
                            className="w-full h-64 p-8 bg-white text-gray-900 rounded-xl flex items-center justify-center overflow-auto shadow-lg"
                        >
                            <div
                                dangerouslySetInnerHTML={{ __html: html }}
                                className="text-2xl"
                            />
                        </div>

                        {/* Quick Helper */}
                        <div className="p-4 bg-gray-800/50 rounded-lg text-sm text-gray-400 space-y-2 border border-gray-700">
                            <p className="font-semibold text-white">Examples:</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setInput('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">Quadratic</button>
                                <button onClick={() => setInput('\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">Gaussian Integral</button>
                                <button onClick={() => setInput('\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">Basel Problem</button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

