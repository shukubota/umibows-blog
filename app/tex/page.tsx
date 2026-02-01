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
    const [cameraStatus, setCameraStatus] = useState<string>('Ready');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Drawing canvas state
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState<{x: number, y: number} | null>(null);

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
            setError(null);
            setCameraStatus('Requesting access...');
            console.log("Requesting camera access...");
            
            // Check for camera availability first
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported in this browser');
            }
            
            // Try different camera constraints
            let constraints = { 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            };
            
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (envError) {
                console.log("Environment camera failed, trying user camera:", envError);
                setCameraStatus('Trying front camera...');
                // Fallback to front camera
                constraints = { 
                    video: { 
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    } 
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            }
            
            console.log("Camera stream obtained:", stream);
            setCameraStatus('Setting up video...');
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                
                // Ensure video plays when metadata is loaded
                videoRef.current.onloadedmetadata = () => {
                    console.log("Video metadata loaded");
                    setCameraStatus('Loading video...');
                    videoRef.current?.play()
                        .then(() => {
                            console.log("Video playing successfully");
                            setCameraStatus('Active');
                        })
                        .catch((playError) => {
                            console.error("Video play error:", playError);
                            setCameraStatus('Play failed');
                        });
                };
                
                // Add event listeners for debugging
                videoRef.current.oncanplay = () => {
                    console.log("Video can play");
                    setCameraStatus('Ready to play');
                };
                videoRef.current.onplay = () => {
                    console.log("Video started playing");
                    setCameraStatus('Playing');
                };
                videoRef.current.onerror = (e) => {
                    console.error("Video error:", e);
                    setCameraStatus('Video error');
                };
                videoRef.current.onloadstart = () => setCameraStatus('Loading...');
                videoRef.current.onwaiting = () => setCameraStatus('Buffering...');
            }
            
            streamRef.current = stream;
            setIsCameraOpen(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
            setCameraStatus('Failed');
            setError(`Could not access camera: ${err instanceof Error ? err.message : 'Unknown error'}. Please allow camera permissions and use HTTPS.`);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
        setCameraStatus('Ready');
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

    // Drawing functions
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        setIsDrawing(true);
        setLastPosition({ x, y });
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawing || !lastPosition) return;

        const canvas = drawingCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';

        ctx.beginPath();
        ctx.moveTo(lastPosition.x, lastPosition.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        setLastPosition({ x, y });
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        setLastPosition(null);
    };

    const clearDrawing = () => {
        const canvas = drawingCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const processDrawing = async () => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;

        setIsProcessing(true);
        setError(null);

        try {
            const imageData = canvas.toDataURL('image/jpeg');
            const result = await generateTexFromImage(imageData);
            if (result.error) {
                setError(result.error);
            } else if (result.tex) {
                setInput(result.tex);
            }
        } catch (err) {
            console.error("Error processing drawing:", err);
            setError("Failed to process drawing.");
        } finally {
            setIsProcessing(false);
        }
    };

    // Initialize drawing canvas
    useEffect(() => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = 400;
        canvas.height = 300;

        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                        TeX Previewer
                    </h1>
                    <p className="text-gray-400">
                        Type LaTeX math expressions or draw them by hand to see them rendered in real-time.
                    </p>
                    {typeof window !== 'undefined' && !window.location.protocol.startsWith('https') && (
                        <div className="mt-2 p-3 bg-yellow-900/50 border border-yellow-500/30 rounded-lg text-yellow-200 text-sm">
                            <strong>Note:</strong> Camera access requires HTTPS. Run <code className="bg-yellow-800/50 px-1 rounded">npm run dev:https</code> for camera functionality.
                        </div>
                    )}
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
                        <div className="space-y-4">
                            <div className="relative w-full max-w-md mx-auto aspect-video bg-gray-900 rounded-lg overflow-hidden">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                    onLoadedMetadata={() => {
                                        console.log("Video metadata loaded in JSX");
                                        if (videoRef.current) {
                                            videoRef.current.play().catch(console.error);
                                        }
                                    }}
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
                                {/* Status indicator */}
                                <div className="absolute top-2 right-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                                    {cameraStatus}
                                </div>
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-sm text-gray-400">
                                    If the camera appears black, check browser permissions and use HTTPS
                                </p>
                                <button
                                    onClick={async () => {
                                        console.log('=== Camera Debug Info ===');
                                        console.log('Protocol:', window.location.protocol);
                                        console.log('User Agent:', navigator.userAgent);
                                        console.log('MediaDevices available:', !!navigator.mediaDevices);
                                        console.log('getUserMedia available:', !!navigator.mediaDevices?.getUserMedia);
                                        
                                        try {
                                            const devices = await navigator.mediaDevices.enumerateDevices();
                                            console.log('Available devices:', devices.filter(d => d.kind === 'videoinput'));
                                        } catch (e) {
                                            console.error('Cannot enumerate devices:', e);
                                        }
                                        
                                        if (videoRef.current) {
                                            console.log('Video element state:', {
                                                readyState: videoRef.current.readyState,
                                                videoWidth: videoRef.current.videoWidth,
                                                videoHeight: videoRef.current.videoHeight,
                                                paused: videoRef.current.paused,
                                                srcObject: !!videoRef.current.srcObject
                                            });
                                        }
                                    }}
                                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                                >
                                    Debug Camera (Check Console)
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

                {/* Drawing Panel Section */}
                <section className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-green-300">Draw Mathematical Expression</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={clearDrawing}
                                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                Clear
                            </button>
                            <button
                                onClick={processDrawing}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                        </svg>
                                        Convert to TeX
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex justify-center mb-4">
                        <canvas
                            ref={drawingCanvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="border border-gray-600 rounded-lg bg-white cursor-crosshair touch-none"
                            style={{ maxWidth: '100%', height: 'auto' }}
                        />
                    </div>
                    
                    <p className="text-sm text-gray-400 text-center">
                        Draw mathematical expressions above and click &quot;Convert to TeX&quot; to generate LaTeX code
                    </p>
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

