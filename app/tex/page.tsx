'use client';

import React, { useState, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function TexPage() {
    const [input, setInput] = useState('\\frac{1}{2}');
    const [html, setHtml] = useState('');
    const [error, setError] = useState<string | null>(null);

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
