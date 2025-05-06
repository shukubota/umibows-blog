'use client'

import React, { useEffect } from 'react';
import { useOthello } from '../../hooks/othello-claude3/use-othello';

const OthelloGame: React.FC = () => {
  const {
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
  } = useOthello();

  useEffect(() => {
    if (currentPlayer === 'white' && !gameOver) {
      setTimeout(() => {
        const availableMoves = getAvailableMoves(board, 'white');
        if (availableMoves.length > 0) {
          const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
          placeDisc(randomMove[0], randomMove[1]);
        } else {
          checkAndHandlePass('white');
        }
      }, 1000);
    }
  }, [currentPlayer, gameOver, board]);

  const getAvailableMoves = (board: string[][], player: 'black' | 'white') => {
    const moves: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (isValidMove(board, i, j, player)) {
          moves.push([i, j]);
        }
      }
    }
    return moves;
  };

  const isValidMove = (board: string[][], row: number, col: number, player: 'black' | 'white') => {
    if (board[row][col] !== '') return false;
    const opponent = player === 'black' ? 'white' : 'black';
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

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

  const handleCellClick = (row: number, col: number) => {
    if (currentPlayer === 'black' && !gameOver) {
      const result = placeDisc(row, col);
      if (!result) {
        checkAndHandlePass('black');
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-[95%] max-w-[600px] aspect-square bg-green-600 border border-black">
        {board.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="w-1/4 aspect-square border border-black flex items-center justify-center cursor-pointer"
                onClick={() => handleCellClick(rowIndex, colIndex)}
              >
                {cell && (
                  <div
                    className={`w-[90%] h-[90%] rounded-full ${
                      cell === 'black' ? 'bg-black' : 'bg-white'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 text-xl">
        <span className="mr-4">Black: {blackCount}</span>
        <span>White: {whiteCount}</span>
      </div>
      <button
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={resetGame}
      >
        Reset Game
      </button>
      {message && <div className="mt-2 text-xl font-bold">{message}</div>}
      {gameOver && (
        <div className="mt-4 text-2xl font-bold">
          {winner === 'draw' ? "It's a draw!" : `${winner === 'black' ? 'Black' : 'White'} wins!`}
        </div>
      )}
    </div>
  );
};

export default OthelloGame;
