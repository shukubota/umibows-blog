import React from 'react';

interface BoardProps {
  lines: JSX.Element[];
  touchableAreas: JSX.Element[];
  stones: (JSX.Element | null)[];
}

const Board: React.FC<BoardProps> = ({ lines, touchableAreas, stones }) => {
  return (
    <div className="relative w-[85vw] h-[85vw] bg-board">
      {lines}
      {touchableAreas}
      {stones}
    </div>
  );
};

export default Board;
