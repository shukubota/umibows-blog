import React from "react";

interface Stone {
  player: "black" | "white";
  position: [number, number];
}

const Page: React.FC = () => {
  const boardSize = 8;
  const initialBoard: Stone[] = [
    { player: "black", position: [4, 4] },
    { player: "white", position: [4, 5] },
    { player: "black", position: [5, 5] },
    { player: "white", position: [5, 4] },
  ];

  const rows = Array.from({ length: boardSize }, (_, i) => i);
  const columns = Array.from({ length: boardSize }, (_, i) => i);

  const getStone = (x: number, y: number): string => {
    const stone = initialBoard.find((s) => s.position[0] === x && s.position[1] === y);
    return stone ? (stone.player === "black" ? "bg-black" : "bg-white") : "";
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-white">
      <div
        className="grid grid-cols-8 gap-0"
        style={{ width: "50rem", height: "50rem", maxWidth: "800px" }}
      >
        {rows.map((row) =>
          columns.map((col) => (
            <div
              key={`${row}-${col}`}
              className="relative w-full h-full border border-black bg-green-600"
            >
              <div
                className={`absolute inset-0 flex items-center justify-center ${getStone(row, col)} rounded-full`}
              />
              <div className="absolute bottom-0 right-0 text-xs text-gray-700">{`(${row + 1}, ${col + 1})`}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Page;
