'use client';

import { useState } from 'react';

interface Move {
  player: 'black' | 'white';
  position: [number, number];
}

const Igo = () => {
  const [moves, setMoves] = useState<Move[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<'black' | 'white'>('black');

  const handleClick = (row: number, col: number) => {
    if (moves.some(move => move.position[0] === row && move.position[1] === col)) {
      return; // 石が置いてある場所には置けない
    }
    const newMove: Move = { player: currentPlayer, position: [row, col] };
    const newMoves = [...moves, newMove];
    setMoves(newMoves);
    console.log('Move History:', newMoves); // 着手履歴を表示
    setCurrentPlayer(currentPlayer === 'black' ? 'white' : 'black');
    setTimeout(() => checkAndRemoveCapturedStones(newMoves, currentPlayer), 0); // 新しい石が追加されてからチェックする
  };

  const checkAndRemoveCapturedStones = (moves: Move[], currentPlayer: 'black' | 'white') => {
    const opponent = currentPlayer === 'black' ? 'white' : 'black';
    const board: (null | 'black' | 'white')[][] = Array(9).fill(null).map(() => Array(9).fill(null));

    moves.forEach(move => {
      board[move.position[0]][move.position[1]] = move.player;
    });

    const visited: boolean[][] = Array(9).fill(null).map(() => Array(9).fill(false));

    const getStoneGroup = (r: number, c: number, color: 'black' | 'white', group: [number, number][]) => {
      if (r < 0 || r >= 9 || c < 0 || c >= 9) return;
      if (board[r][c] !== color || visited[r][c]) return;
      visited[r][c] = true;
      group.push([r, c]);
      getStoneGroup(r - 1, c, color, group);
      getStoneGroup(r + 1, c, color, group);
      getStoneGroup(r, c - 1, color, group);
      getStoneGroup(r, c + 1, color, group);
    };

    const isGroupCaptured = (group: [number, number][], color: 'black' | 'white'): boolean => {
      for (const [r, c] of group) {
        if (r > 0 && board[r - 1][c] === null) return false;
        if (r < 8 && board[r + 1][c] === null) return false;
        if (c > 0 && board[r][c - 1] === null) return false;
        if (c < 8 && board[r][c + 1] === null) return false;
      }
      return true;
    };

    const capturedStones: [number, number][] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === opponent && !visited[r][c]) {
          const group: [number, number][] = [];
          getStoneGroup(r, c, opponent, group);
          if (isGroupCaptured(group, opponent)) {
            capturedStones.push(...group);
          }
        }
      }
    }

    const newMoves = moves.filter(move => {
      return !capturedStones.some(stone => stone[0] === move.position[0] && stone[1] === move.position[1]);
    });

    setMoves(newMoves);
  };

  const clearBoard = () => {
    setMoves([]);
    setCurrentPlayer('black');
  };

  const lines = [];
  const touchableAreas = [];
  const labels = {
    vertical: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    horizontal: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  };

  for (let i = 0; i < 9; i++) {
    // Vertical lines
    lines.push(
      <div
        key={`v-${i}`}
        className="absolute bg-black"
        style={{
          top: '10%',
          bottom: '10%',
          left: `${(i + 1) * 10}%`,
          width: '1px',
        }}
      />,
      <div
        key={`v-label-${i}`}
        className="absolute text-black"
        style={{
          top: '2%',
          left: `${(i + 1) * 10}%`,
          transform: 'translateX(-50%)',
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
          left: '10%',
          right: '10%',
          top: `${(i + 1) * 10}%`,
          height: '1px',
        }}
      />,
      <div
        key={`h-label-${i}`}
        className="absolute text-black"
        style={{
          top: `${(i + 1) * 10}%`,
          left: '2%',
          transform: 'translateY(-50%)',
        }}
      >
        {labels.horizontal[i]}
      </div>
    );
  }

  // Create touchable areas
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      touchableAreas.push(
        <div
          key={`touch-${i}-${j}`}
          className="absolute w-8 h-8"
          style={{
            top: `${(i + 1) * 10}%`,
            left: `${(j + 1) * 10}%`,
            width: '8%',
            height: '8%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1, // Ensure touchable areas are on top
          }}
          onClick={() => handleClick(i, j)}
        />
      );
    }
  }

  const stones = moves.map((move, index) => {
    const [row, col] = move.position;
    const color = move.player === 'black' ? 'bg-black' : 'bg-white';
    return (
      <div
        key={`stone-${index}`}
        className={`absolute ${color} rounded-full border border-black`}
        style={{
          top: `${(row + 1) * 10}%`,
          left: `${(col + 1) * 10}%`,
          width: '8%',
          height: '8%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    );
  });

  return (
    <div className="flex flex-col items-center h-screen">
      <button
        onClick={clearBoard}
        className="mb-4 px-4 py-2 bg-red-500 text-white rounded"
      >
        Clear Board
      </button>
      <div className="relative w-[85vw] h-[85vw] bg-board">
        {lines}
        {touchableAreas}
        {stones}
      </div>
    </div>
  );
};

export default Igo;
