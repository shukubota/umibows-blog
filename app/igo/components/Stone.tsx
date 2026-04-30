import React from "react";
import { StoneColor } from "../../../hooks/useGoGame";

interface StoneProps {
  color: StoneColor;
  row: number;
  col: number;
  dimmed?: boolean;
}

const Stone: React.FC<StoneProps> = ({ color, row, col, dimmed }) => {
  const isBlack = color === "black";
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: `${col * 36 + 18 - 15}px`,
        top: `${row * 36 + 18 - 15}px`,
        width: "30px",
        height: "30px",
        background: isBlack
          ? "radial-gradient(circle at 35% 35%, #555, #000)"
          : "radial-gradient(circle at 35% 35%, #fff, #bbb)",
        border: isBlack ? "1px solid #111" : "1px solid #888",
        boxShadow: "1px 2px 4px rgba(0,0,0,0.5)",
        opacity: dimmed ? 0.35 : 1,
        zIndex: 5,
      }}
    />
  );
};

export default Stone;
