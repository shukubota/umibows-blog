import React from "react";
import { GamePhase, StoneColor } from "../../../hooks/useGoGame";

interface GameControlsProps {
  phase: GamePhase;
  currentTurn: StoneColor;
  isCpuThinking: boolean;
  onPass: () => void;
  onConfirmScore: () => void;
  onReset: () => void;
}

const GameControls: React.FC<GameControlsProps> = ({
  phase,
  currentTurn,
  isCpuThinking,
  onPass,
  onConfirmScore,
  onReset,
}) => {
  return (
    <div className="flex flex-col gap-3 mt-4 w-full">
      {phase === "playing" && (
        <>
          <div className="text-center text-sm font-medium">
            {isCpuThinking ? (
              <span className="text-yellow-400">CPU が考え中…</span>
            ) : currentTurn === "black" ? (
              <span className="text-gray-200">あなたの番（黒）</span>
            ) : (
              <span className="text-gray-400">CPU の番（白）</span>
            )}
          </div>
          <button
            onClick={onPass}
            disabled={currentTurn !== "black" || isCpuThinking}
            className="px-4 py-2 rounded bg-gray-600 text-white text-sm hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            パス
          </button>
        </>
      )}
      {phase === "scoring" && (
        <>
          <p className="text-sm text-gray-300 text-center">死石をクリックしてマーク → スコア確定</p>
          <button
            onClick={onConfirmScore}
            className="px-4 py-2 rounded bg-green-700 text-white text-sm hover:bg-green-600"
          >
            スコア確定
          </button>
        </>
      )}
      <button
        onClick={onReset}
        className="px-4 py-2 rounded bg-red-800 text-white text-sm hover:bg-red-700"
      >
        リセット
      </button>
    </div>
  );
};

export default GameControls;
