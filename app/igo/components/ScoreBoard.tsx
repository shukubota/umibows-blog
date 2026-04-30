import React from "react";
import { Prisoners, GamePhase, FinalScore } from "../../../hooks/useGoGame";

interface ScoreBoardProps {
  prisoners: Prisoners;
  komi: number;
  phase: GamePhase;
  finalScore: FinalScore | null;
}

const Row: React.FC<{ label: string; black: string | number; white: string | number }> = ({
  label,
  black,
  white,
}) => (
  <tr>
    <td className="py-0.5 pr-3 text-gray-400 text-xs">{label}</td>
    <td className="py-0.5 text-center font-mono text-sm">{black}</td>
    <td className="py-0.5 text-center font-mono text-sm">{white}</td>
  </tr>
);

const ScoreBoard: React.FC<ScoreBoardProps> = ({ prisoners, komi, phase, finalScore }) => {
  return (
    <div className="mt-4 w-full">
      <table className="w-full text-white border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs text-gray-400 font-normal pb-1" />
            <th className="text-center text-sm font-semibold pb-1">黒</th>
            <th className="text-center text-sm font-semibold pb-1">白</th>
          </tr>
        </thead>
        <tbody>
          <Row label="取った石" black={prisoners.black} white={prisoners.white} />
          <Row label="コミ" black="—" white={komi} />
          {phase === "finished" && finalScore && (
            <>
              <Row label="地" black={finalScore.blackTerritory} white={finalScore.whiteTerritory} />
              <tr>
                <td colSpan={3} className="border-t border-gray-600 pt-1" />
              </tr>
              <Row
                label="合計"
                black={finalScore.blackTotal.toFixed(1)}
                white={finalScore.whiteTotal.toFixed(1)}
              />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ScoreBoard;
