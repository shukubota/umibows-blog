import React from "react";

interface MarkerProps {
  type: "lastMove" | "deadStone";
  row: number;
  col: number;
}

const Marker: React.FC<MarkerProps> = ({ type, row, col }) => {
  const size = 30;
  const left = col * 36 + 18 - size / 2;
  const top = row * 36 + 18 - size / 2;

  if (type === "lastMove") {
    return (
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${size}px`,
          height: `${size}px`,
          zIndex: 6,
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "rgba(200,50,50,0.85)",
          }}
        />
      </div>
    );
  }

  // deadStone: × マーク
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${size}px`,
        height: `${size}px`,
        zIndex: 7,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 30 30">
        <line x1="7" y1="7" x2="23" y2="23" stroke="red" strokeWidth="3" strokeLinecap="round" />
        <line x1="23" y1="7" x2="7" y2="23" stroke="red" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export default Marker;
