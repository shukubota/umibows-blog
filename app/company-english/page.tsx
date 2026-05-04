"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { generateCompanyQA, CompanyQAResult, QAItem } from "./actions";

const STEPS = [
  { label: "Researching company...", icon: "🔍" },
  { label: "Analyzing team members...", icon: "👥" },
  { label: "Generating Q&A scenarios...", icon: "💬" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col gap-3 my-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-500 ${
              i < currentStep
                ? "bg-green-600 text-white"
                : i === currentStep
                  ? "bg-blue-600 text-white animate-pulse"
                  : "bg-gray-700 text-gray-500"
            }`}
          >
            {i < currentStep ? "✓" : step.icon}
          </div>
          <span
            className={`text-sm transition-colors duration-500 ${
              i < currentStep
                ? "text-green-400"
                : i === currentStep
                  ? "text-blue-300"
                  : "text-gray-600"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function QACard({ item }: { item: QAItem }) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="border border-gray-700 rounded-xl p-5 bg-gray-800/50 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm">
          {item.memberName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{item.memberName}</p>
          <p className="text-gray-400 text-xs">{item.memberRole}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-blue-400 font-semibold mb-1">YOUR QUESTION</p>
          <p className="text-white text-sm">&quot;{item.question}&quot;</p>
        </div>

        {showAnswer ? (
          <>
            <div className="bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-green-400 font-semibold mb-1">THEIR ANSWER</p>
              <p className="text-gray-200 text-sm italic">&quot;{item.sampleAnswer}&quot;</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-purple-400 font-semibold mb-1">FOLLOW-UP</p>
              <p className="text-white text-sm">&quot;{item.followUpQuestion}&quot;</p>
            </div>
          </>
        ) : (
          <button
            onClick={() => setShowAnswer(true)}
            className="w-full py-2 text-sm text-gray-400 border border-gray-600 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            Show answer & follow-up →
          </button>
        )}
      </div>
    </div>
  );
}

export default function CompanyEnglishPage() {
  const [companyName, setCompanyName] = useState("");
  const [result, setResult] = useState<CompanyQAResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(0);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isPending) {
      setCurrentStep(0);
      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step = Math.min(step + 1, STEPS.length - 1);
        setCurrentStep(step);
      }, 8000);
    } else {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setCurrentStep(0);
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [isPending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setResult(null);
    setError("");

    startTransition(async () => {
      try {
        const data = await generateCompanyQA(companyName.trim());
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate. Please try again.");
        console.error(err);
      }
    });
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Company English Q&A</h1>
        <p className="text-gray-400 mb-8 text-sm">
          Enter a company name to get personalized English conversation scenarios with hypothetical
          team members.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Google, Toyota, Goldman Sachs"
            disabled={isPending}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !companyName.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
          >
            {isPending ? "..." : "Generate"}
          </button>
        </form>

        {isPending && <StepIndicator currentStep={currentStep} />}

        {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

        {result && (
          <div className="space-y-8 animate-fadeIn">
            <section>
              <h2 className="text-lg font-semibold text-blue-400 mb-3">Company Overview</h2>
              <div className="bg-gray-800 rounded-xl p-5 text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                {result.companyInfo}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-blue-400 mb-3">Team Members</h2>
              <div className="grid gap-3">
                {result.members.map((m, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {m.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{m.name}</p>
                      <p className="text-purple-400 text-xs mb-1">{m.role}</p>
                      <p className="text-gray-400 text-xs">{m.background}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-blue-400 mb-3">Conversation Scenarios</h2>
              <p className="text-gray-500 text-xs mb-4">
                Tap &quot;Show answer&quot; to reveal the sample response and follow-up.
              </p>
              <div className="space-y-4">
                {result.qaList.map((item, i) => (
                  <QACard key={i} item={item} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
