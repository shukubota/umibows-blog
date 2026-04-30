import React from "react";
import {
  Grid,
  GamePhase,
  Point,
  BOARD_SIZE,
  STAR_POINTS,
  StoneColor,
} from "../../../hooks/useGoGame";
import Stone from "./Stone";
import Marker from "./Marker";

interface BoardProps {
  grid: Grid;
  markedDead: Set<string>;
  lastMove: Point | null;
  onPointClick: (point: Point) => void;
  phase: GamePhase;
}

const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "J"];
const ROW_LABELS = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];

const Board: React.FC<BoardProps> = ({ grid, markedDead, lastMove, onPointClick, phase }) => {
  const isClickable = phase !== "finished";

  return (
    <div className="flex flex-col items-center select-none">
      {/* 列ラベル（上） */}
      <div className="flex ml-7 mb-1">
        {COL_LABELS.map((label) => (
          <div key={label} className="w-9 text-center text-xs text-gray-500">
            {label}
          </div>
        ))}
      </div>

      <div className="flex">
        {/* 行ラベル（左） */}
        <div className="flex flex-col">
          {ROW_LABELS.map((label) => (
            <div
              key={label}
              className="h-9 flex items-center justify-end pr-1 text-xs text-gray-500 w-6"
            >
              {label}
            </div>
          ))}
        </div>

        {/* 盤面本体 */}
        <div
          className="relative"
          style={{
            width: `${BOARD_SIZE * 36}px`,
            height: `${BOARD_SIZE * 36}px`,
            backgroundColor: "#dcb468",
            boxShadow: "2px 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {/* 盤線（縦） */}
          {Array.from({ length: BOARD_SIZE }, (_, i) => (
            <div
              key={`v-${i}`}
              className="absolute bg-gray-800"
              style={{
                left: `${i * 36 + 18}px`,
                top: "18px",
                bottom: "18px",
                width: "1px",
              }}
            />
          ))}
          {/* 盤線（横） */}
          {Array.from({ length: BOARD_SIZE }, (_, i) => (
            <div
              key={`h-${i}`}
              className="absolute bg-gray-800"
              style={{
                top: `${i * 36 + 18}px`,
                left: "18px",
                right: "18px",
                height: "1px",
              }}
            />
          ))}

          {/* 星 */}
          {STAR_POINTS.map((p) => (
            <div
              key={`star-${p.row}-${p.col}`}
              className="absolute rounded-full bg-gray-800"
              style={{
                left: `${p.col * 36 + 18 - 3}px`,
                top: `${p.row * 36 + 18 - 3}px`,
                width: "6px",
                height: "6px",
              }}
            />
          ))}

          {/* 石 */}
          {grid.flatMap((row, r) =>
            row.map((cell, c) => {
              if (cell === "empty") return null;
              const key = `${r},${c}`;
              const isDead = markedDead.has(key);
              const isLast = lastMove?.row === r && lastMove?.col === c;
              return (
                <React.Fragment key={`cell-${r}-${c}`}>
                  <Stone color={cell as StoneColor} row={r} col={c} dimmed={isDead} />
                  {isLast && <Marker type="lastMove" row={r} col={c} />}
                  {isDead && <Marker type="deadStone" row={r} col={c} />}
                </React.Fragment>
              );
            })
          )}

          {/* クリック領域 */}
          {Array.from({ length: BOARD_SIZE }, (_, r) =>
            Array.from({ length: BOARD_SIZE }, (_, c) => (
              <div
                key={`click-${r}-${c}`}
                className={`absolute ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                style={{
                  left: `${c * 36}px`,
                  top: `${r * 36}px`,
                  width: "36px",
                  height: "36px",
                  zIndex: 10,
                }}
                onClick={() => isClickable && onPointClick({ row: r, col: c })}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Board;
