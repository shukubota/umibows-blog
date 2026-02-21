"use client";

import React, { useState, useEffect, useCallback } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Stone from "./components/Stone";
import Board from "./components/Board";
import Marker from "./components/Marker";

interface Move {
  player: "black" | "white";
  position: [number, number];
}

const Igo = () => {
  const [moves, setMoves] = useState<Move[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<"black" | "white">("black");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [blackCaptured, setBlackCaptured] = useState(0);
  const [whiteCaptured, setWhiteCaptured] = useState(0);
  const [blackTerritory, setBlackTerritory] = useState(0);
  const [whiteTerritory, setWhiteTerritory] = useState(0);
  const [boardState, setBoardState] = useState<(null | "black" | "white")[][]>(
    Array(9)
      .fill(null)
      .map(() => Array(9).fill(null))
  );

  const updateTerritories = useCallback(() => {
    const visited: boolean[][] = Array(9)
      .fill(null)
      .map(() => Array(9).fill(false));
    let blackTerritory = 0;
    let whiteTerritory = 0;

    const checkTerritory = (r: number, c: number, color: "black" | "white"): number => {
      if (r < 0 || r >= 9 || c < 0 || c >= 9) return 0;
      if (boardState[r][c] !== null || visited[r][c]) return 0;
      visited[r][c] = true;

      let territory = 1;
      if (
        (r > 0 && boardState[r - 1][c] !== color && boardState[r - 1][c] !== null) ||
        (r < 8 && boardState[r + 1][c] !== color && boardState[r + 1][c] !== null) ||
        (c > 0 && boardState[r][c - 1] !== color && boardState[r][c - 1] !== null) ||
        (c < 8 && boardState[r][c + 1] !== color && boardState[r][c + 1] !== null)
      ) {
        return 0; // 周りに違う色がある場合は0
      }
      territory += checkTerritory(r - 1, c, color);
      territory += checkTerritory(r + 1, c, color);
      territory += checkTerritory(r, c - 1, color);
      territory += checkTerritory(r, c + 1, color);

      return territory;
    };

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!visited[r][c] && boardState[r][c] === null) {
          if (
            (r > 0 && boardState[r - 1][c] === "black") ||
            (r < 8 && boardState[r + 1][c] === "black") ||
            (c > 0 && boardState[r][c - 1] === "black") ||
            (c < 8 && boardState[r][c + 1] === "black")
          ) {
            blackTerritory += checkTerritory(r, c, "black");
          } else if (
            (r > 0 && boardState[r - 1][c] === "white") ||
            (r < 8 && boardState[r + 1][c] === "white") ||
            (c > 0 && boardState[r][c - 1] === "white") ||
            (c < 8 && boardState[r][c + 1] === "white")
          ) {
            whiteTerritory += checkTerritory(r, c, "white");
          }
        }
      }
    }

    setBlackTerritory(blackTerritory);
    setWhiteTerritory(whiteTerritory);
  }, [boardState]);

  useEffect(() => {
    updateTerritories();
  }, [moves, boardState, updateTerritories]);

  const handleClick = (row: number, col: number) => {
    if (boardState[row - 1][col - 1] !== null) {
      return; // 石が置いてある場所には置けない
    }
    const newMove: Move = { player: currentPlayer, position: [col, row] }; // 座標を(1,1)から(9,9)に変換
    const newMoves = [...moves, newMove];
    const newBoardState = boardState.map((row) => row.slice());
    newBoardState[row - 1][col - 1] = currentPlayer; // 座標を(1,1)から(9,9)に変換

    if (isForbiddenMove(boardState, row, col, currentPlayer)) {
      setSnackbarOpen(true);
      return; // 着手禁止手の場合はここで終了
    }

    const capturedStones = checkAndRemoveCapturedStones(newBoardState, currentPlayer);

    setMoves(newMoves);
    setBoardState(newBoardState);
    if (currentPlayer === "black") {
      setWhiteCaptured(whiteCaptured + capturedStones.length); // 白が取られた石の数を更新
    } else {
      setBlackCaptured(blackCaptured + capturedStones.length); // 黒が取られた石の数を更新
    }
    setCurrentPlayer(currentPlayer === "black" ? "white" : "black");
    console.log("Move History:", JSON.stringify(newMoves)); // 着手履歴を文字列として表示
  };

  const isForbiddenMove = (
    board: (null | "black" | "white")[][],
    row: number,
    col: number,
    player: "black" | "white"
  ): boolean => {
    const opponent = player === "black" ? "white" : "black";
    const newBoard = board.map((row) => row.slice());
    newBoard[row - 1][col - 1] = player;

    const capturedStones = checkAndRemoveCapturedStones(newBoard, player);
    if (capturedStones.length > 0) {
      return false; // 相手の石が取れる場合は着手禁止ではない
    }

    const visited: boolean[][] = Array(9)
      .fill(null)
      .map(() => Array(9).fill(false));
    const stoneGroup: [number, number][] = [];

    const getStoneGroup = (r: number, c: number, color: "black" | "white") => {
      if (r < 0 || r >= 9 || c < 0 || c >= 9) return;
      if (newBoard[r][c] !== color || visited[r][c]) return;
      visited[r][c] = true;
      stoneGroup.push([r, c]);
      getStoneGroup(r - 1, c, color);
      getStoneGroup(r + 1, c, color);
      getStoneGroup(r, c - 1, color);
      getStoneGroup(r, c + 1, color);
    };

    getStoneGroup(row - 1, col - 1, player);

    const surroundedByOwn = stoneGroup.every(([r, c]) => {
      return (
        r > 0 &&
        newBoard[r - 1][c] !== opponent &&
        r < 8 &&
        newBoard[r + 1][c] !== opponent &&
        c > 0 &&
        newBoard[r][c - 1] !== opponent &&
        c < 8 &&
        newBoard[r][c + 1] !== opponent
      );
    });

    if (surroundedByOwn) {
      return false; // 自分の石で囲まれている場合は着手禁止ではない
    }

    return isGroupCaptured(stoneGroup, newBoard);
  };

  const isGroupCaptured = (
    group: [number, number][],
    board: (null | "black" | "white")[][]
  ): boolean => {
    for (const [r, c] of group) {
      if (r > 0 && board[r - 1][c] === null) return false;
      if (r < 8 && board[r + 1][c] === null) return false;
      if (c > 0 && board[r][c - 1] === null) return false;
      if (c < 8 && board[r][c + 1] === null) return false;
    }
    return true;
  };

  const checkAndRemoveCapturedStones = (
    board: (null | "black" | "white")[][],
    currentPlayer: "black" | "white"
  ): [number, number][] => {
    const opponent = currentPlayer === "black" ? "white" : "black";
    const visited: boolean[][] = Array(9)
      .fill(null)
      .map(() => Array(9).fill(false));

    const getStoneGroup = (
      r: number,
      c: number,
      color: "black" | "white",
      group: [number, number][]
    ) => {
      if (r < 0 || r >= 9 || c < 0 || c >= 9) return;
      if (board[r][c] !== color || visited[r][c]) return;
      visited[r][c] = true;
      group.push([r, c]);
      getStoneGroup(r - 1, c, color, group);
      getStoneGroup(r + 1, c, color, group);
      getStoneGroup(r, c - 1, color, group);
      getStoneGroup(r, c + 1, color, group);
    };

    const capturedStones: [number, number][] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === opponent && !visited[r][c]) {
          const group: [number, number][] = [];
          getStoneGroup(r, c, opponent, group);
          if (isGroupCaptured(group, board)) {
            capturedStones.push(...group);
            // Remove captured stones from board
            group.forEach(([gr, gc]) => {
              board[gr][gc] = null;
            });
          }
        }
      }
    }

    return capturedStones;
  };
  const checkLifeAndDeath = (): [number, number][] => {
    const deadStones: [number, number][] = [];
    const visited: boolean[][] = Array(9)
      .fill(null)
      .map(() => Array(9).fill(false));

    const getStoneGroup = (
      r: number,
      c: number,
      color: "black" | "white",
      group: [number, number][]
    ) => {
      if (r < 0 || r >= 9 || c < 0 || c >= 9) return;
      if (boardState[r][c] !== color || visited[r][c]) return;
      visited[r][c] = true;
      group.push([r, c]);
      getStoneGroup(r - 1, c, color, group);
      getStoneGroup(r + 1, c, color, group);
      getStoneGroup(r, c - 1, color, group);
      getStoneGroup(r, c + 1, color, group);
    };

    const isGroupAlive = (
      group: [number, number][],
      board: (null | "black" | "white")[][]
    ): boolean => {
      for (const [r, c] of group) {
        if (r > 0 && board[r - 1][c] === null) return true;
        if (r < 8 && board[r + 1][c] === null) return true;
        if (c > 0 && board[r][c - 1] === null) return true;
        if (c < 8 && board[r][c + 1] === null) return true;
      }
      return false;
    };

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (boardState[r][c] !== null && !visited[r][c]) {
          const group: [number, number][] = [];
          getStoneGroup(r, c, boardState[r][c]!, group);
          if (!isGroupAlive(group, boardState)) {
            deadStones.push(...group);
          }
        }
      }
    }

    return deadStones;
  };

  const clearBoard = () => {
    setMoves([]);
    setCurrentPlayer("black");
    setBlackCaptured(0);
    setWhiteCaptured(0);
    setBoardState(
      Array(9)
        .fill(null)
        .map(() => Array(9).fill(null))
    );
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  const lines = [];
  const touchableAreas = [];
  const labels = {
    vertical: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    horizontal: ["一", "二", "三", "四", "五", "六", "七", "八", "九"],
  };

  for (let i = 0; i < 9; i++) {
    // Vertical lines
    lines.push(
      <div
        key={`v-${i}`}
        className="absolute bg-black"
        style={{
          top: "10%",
          bottom: "10%",
          left: `${(i + 1) * 10}%`,
          width: "1px",
        }}
      />,
      <div
        key={`v-label-${i}`}
        className="absolute text-black"
        style={{
          top: "2%",
          left: `${(i + 1) * 10}%`,
          transform: "translateX(-50%)",
        }}
      >
        {labels.vertical[i]}
      </div>
    );

    // Horizontal lines
    lines.push(
      <div
        key={`h-${i}`}
        className="absolute bg-black"
        style={{
          left: "10%",
          right: "10%",
          top: `${(i + 1) * 10}%`,
          height: "1px",
        }}
      />,
      <div
        key={`h-label-${i}`}
        className="absolute text-black"
        style={{
          top: `${(i + 1) * 10}%`,
          left: "2%",
          transform: "translateY(-50%)",
        }}
      >
        {labels.horizontal[i]}
      </div>
    );
  }

  // Create touchable areas
  for (let i = 1; i <= 9; i++) {
    for (let j = 1; j <= 9; j++) {
      touchableAreas.push(
        <div
          key={`touch-${i}-${j}`}
          className="absolute w-8 h-8"
          style={{
            top: `${i * 10}%`,
            left: `${j * 10}%`,
            width: "8%",
            height: "8%",
            transform: "translate(-50%, -50%)",
            zIndex: 1, // Ensure touchable areas are on top
          }}
          onClick={() => handleClick(i, j)}
        />
      );
    }
  }

  const deadStones = checkLifeAndDeath();

  return (
    <div className="flex flex-col items-center h-screen">
      <button onClick={clearBoard} className="mb-4 px-4 py-2 bg-red-500 text-white rounded">
        Clear Board
      </button>
      <Board
        lines={lines}
        touchableAreas={touchableAreas}
        stones={boardState.flatMap((row, rowIndex) =>
          row.map((cell, colIndex) =>
            cell !== null ? (
              <React.Fragment key={`stone-${rowIndex}-${colIndex}`}>
                <Stone color={cell} position={[colIndex + 1, rowIndex + 1]} />
                {deadStones.some(([r, c]) => r === rowIndex && c === colIndex) && (
                  <Marker position={[colIndex + 1, rowIndex + 1]} />
                )}
              </React.Fragment>
            ) : null
          )
        )}
      />
      <div className="mt-4 flex justify-between w-[85vw]" style={{ color: "black" }}>
        <div>黒の取った石の数: {blackCaptured}</div>
        <div>白の取った石の数: {whiteCaptured}</div>
      </div>
      <div className="mt-2 flex justify-between w-[85vw]" style={{ color: "black" }}>
        <div>黒の囲った交差点の数: {blackTerritory}</div>
        <div>白の囲った交差点の数: {whiteTerritory}</div>
      </div>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="warning" sx={{ width: "100%" }}>
          着手禁止手です
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Igo;
