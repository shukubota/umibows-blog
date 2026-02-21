"use client";

import { useState, useCallback } from "react";

type Player = "black" | "white";
type Board = string[][];

export const useOthello = () => {
  const initialBoard: Board = [
    ["", "", "", ""],
    ["", "black", "white", ""],
    ["", "white", "black", ""],
    ["", "", "", ""],
  ];

  const [board, setBoard] = useState<Board>(initialBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("black");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | "draw" | null>(null);
  const [message, setMessage] = useState<string>("");

  const countDiscs = useCallback(() => {
    let blackCount = 0;
    let whiteCount = 0;
    board.forEach((row) => {
      row.forEach((cell) => {
        if (cell === "black") blackCount++;
        if (cell === "white") whiteCount++;
      });
    });
    return { blackCount, whiteCount };
  }, [board]);

  const { blackCount, whiteCount } = countDiscs();

  const isValidMove = (row: number, col: number, player: Player): boolean => {
    if (board[row][col] !== "") return false;
    const opponent = player === "black" ? "white" : "black";
    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    for (const [dx, dy] of directions) {
      let x = row + dx;
      let y = col + dy;
      let hasOpponent = false;

      while (x >= 0 && x < 4 && y >= 0 && y < 4) {
        if (board[x][y] === opponent) {
          hasOpponent = true;
        } else if (board[x][y] === player && hasOpponent) {
          return true;
        } else {
          break;
        }
        x += dx;
        y += dy;
      }
    }
    return false;
  };

  const flipDiscs = (row: number, col: number, player: Player): void => {
    const opponent = player === "black" ? "white" : "black";
    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    const newBoard = [...board];
    newBoard[row][col] = player;

    for (const [dx, dy] of directions) {
      let x = row + dx;
      let y = col + dy;
      const toFlip: [number, number][] = [];

      while (x >= 0 && x < 4 && y >= 0 && y < 4) {
        if (board[x][y] === opponent) {
          toFlip.push([x, y]);
        } else if (board[x][y] === player) {
          toFlip.forEach(([fx, fy]) => {
            newBoard[fx][fy] = player;
          });
          break;
        } else {
          break;
        }
        x += dx;
        y += dy;
      }
    }

    setBoard(newBoard);
  };

  const checkAndHandlePass = (player: Player): boolean => {
    if (!hasValidMoves(player)) {
      const oppositePlayer = player === "black" ? "white" : "black";
      if (hasValidMoves(oppositePlayer)) {
        setMessage(`${player === "black" ? "Player" : "CPU"} passes`);
        setTimeout(() => {
          setMessage("");
          setCurrentPlayer(oppositePlayer);
        }, 2000);
        return true;
      } else {
        endGame();
        return true;
      }
    }
    return false;
  };

  const placeDisc = (row: number, col: number): boolean => {
    if (gameOver || !isValidMove(row, col, currentPlayer)) return false;

    flipDiscs(row, col, currentPlayer);
    const nextPlayer = currentPlayer === "black" ? "white" : "black";
    setCurrentPlayer(nextPlayer);

    if (checkAndHandlePass(nextPlayer)) {
      return true;
    }

    return true;
  };

  const hasValidMoves = (player: Player): boolean => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (isValidMove(i, j, player)) {
          return true;
        }
      }
    }
    return false;
  };

  const endGame = () => {
    setGameOver(true);
    const { blackCount, whiteCount } = countDiscs();
    if (blackCount > whiteCount) {
      setWinner("black");
    } else if (whiteCount > blackCount) {
      setWinner("white");
    } else {
      setWinner("draw");
    }
  };

  const resetGame = () => {
    setBoard(initialBoard);
    setCurrentPlayer("black");
    setGameOver(false);
    setWinner(null);
    setMessage("");
  };

  return {
    board,
    currentPlayer,
    placeDisc,
    resetGame,
    blackCount,
    whiteCount,
    gameOver,
    winner,
    message,
    checkAndHandlePass,
  };
};
