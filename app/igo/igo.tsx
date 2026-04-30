"use client";

import React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { useGoGame } from "../../hooks/useGoGame";
import { Point } from "../../hooks/useGoGame";
import Board from "./components/Board";
import GameControls from "./components/GameControls";
import ScoreBoard from "./components/ScoreBoard";
import GameResult from "./components/GameResult";

const Igo = () => {
  const { state, finalScore, placeStone, pass, toggleDeadStone, confirmScore, resetGame, isLegal } =
    useGoGame();
  const [illegalAlert, setIllegalAlert] = React.useState(false);

  const handlePointClick = (point: Point) => {
    if (state.gamePhase === "playing") {
      if (state.currentTurn !== "black" || state.isCpuThinking) return;
      if (!isLegal(point)) {
        setIllegalAlert(true);
        return;
      }
      placeStone(point);
    } else if (state.gamePhase === "scoring") {
      toggleDeadStone(point);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center py-6 px-4">
      <h1 className="text-2xl font-bold text-white mb-4">囲碁（9路盤）</h1>
      <p className="text-gray-400 text-sm mb-4">あなた = 黒 ／ CPU = 白</p>

      <Board
        grid={state.grid}
        markedDead={state.markedDead}
        lastMove={state.lastMove}
        onPointClick={handlePointClick}
        phase={state.gamePhase}
      />

      <div className="w-full max-w-xs mt-4">
        <GameControls
          phase={state.gamePhase}
          currentTurn={state.currentTurn}
          isCpuThinking={state.isCpuThinking}
          onPass={pass}
          onConfirmScore={confirmScore}
          onReset={resetGame}
        />
        <ScoreBoard
          prisoners={state.prisoners}
          komi={state.komi}
          phase={state.gamePhase}
          finalScore={finalScore}
        />
      </div>

      {state.gamePhase === "finished" && finalScore && (
        <GameResult finalScore={finalScore} onReset={resetGame} />
      )}

      <Snackbar
        open={illegalAlert}
        autoHideDuration={2000}
        onClose={() => setIllegalAlert(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setIllegalAlert(false)}>
          着手禁止手です
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Igo;
