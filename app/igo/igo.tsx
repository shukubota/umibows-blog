'use client';

import { useState } from 'react';

const Igo = () => {
  const [moves, setMoves] = useState([{ player: 'black', position: [3, 3] }]);
  const lines = [];
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
    <div className="flex justify-center items-center h-screen">
      <div className="relative w-[85vw] h-[85vw] bg-board mt-[30rem] mb-[30rem]">
        {lines}
        {stones}
      </div>
    </div>
  );
};

export default Igo;
