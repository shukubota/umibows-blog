import React from "react";
import { FinalScore } from "../../../hooks/useGoGame";

interface GameResultProps {
  finalScore: FinalScore;
  onReset: () => void;
}

const GameResult: React.FC<GameResultProps> = ({ finalScore, onReset }) => {
  const isPlayerWin = finalScore.winner === "black";
  const diff = Math.abs(finalScore.blackTotal - finalScore.whiteTotal).toFixed(1);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-sm w-full mx-4">
        <div className={`text-4xl font-bold ${isPlayerWin ? "text-yellow-400" : "text-blue-400"}`}>
          {isPlayerWin ? "あなたの勝ち！" : "CPUの勝ち"}
        </div>
        <div className="text-gray-300 text-sm">
          {finalScore.winner === "black" ? "黒" : "白"} {diff} 目勝ち
        </div>
        <table className="text-white text-sm w-full border-collapse mt-2">
          <thead>
            <tr className="text-gray-400 text-xs">
              <th className="text-left font-normal pb-1" />
              <th className="text-center pb-1">黒（あなた）</th>
              <th className="text-center pb-1">白（CPU）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-gray-400 py-0.5 pr-2">地</td>
              <td className="text-center">{finalScore.blackTerritory}</td>
              <td className="text-center">{finalScore.whiteTerritory}</td>
            </tr>
            <tr>
              <td className="text-gray-400 py-0.5 pr-2">取った石</td>
              <td className="text-center">{finalScore.blackPrisoners}</td>
              <td className="text-center">{finalScore.whitePrisoners}</td>
            </tr>
            <tr>
              <td className="text-gray-400 py-0.5 pr-2">コミ</td>
              <td className="text-center">—</td>
              <td className="text-center">{finalScore.komi}</td>
            </tr>
            <tr className="border-t border-gray-700">
              <td className="text-gray-400 pt-1 pr-2 font-semibold">合計</td>
              <td className="text-center pt-1 font-semibold">{finalScore.blackTotal.toFixed(1)}</td>
              <td className="text-center pt-1 font-semibold">{finalScore.whiteTotal.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
        <button
          onClick={onReset}
          className="mt-4 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          もう一局
        </button>
      </div>
    </div>
  );
};

export default GameResult;
