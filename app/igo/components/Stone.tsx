import React from 'react';

interface StoneProps {
  color: 'black' | 'white';
  position: [number, number];
}

const Stone: React.FC<StoneProps> = ({ color, position }) => {
  const [row, col] = position;
  const backgroundColor = color === 'black' ? 'black' : 'white';
  return (
    <div
      className={`absolute rounded-full border border-black`}
      style={{
        backgroundColor, // 背景色を直接設定
        top: `${(row + 1) * 10}%`,
        left: `${(col + 1) * 10}%`,
        width: '8%',
        height: '8%',
        transform: 'translate(-50%, -50%)',
      }}
    />
  );
};

export default Stone;
