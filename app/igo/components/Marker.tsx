import React from 'react';

interface MarkerProps {
  position: [number, number];
}

const Marker: React.FC<MarkerProps> = ({ position }) => {
  const [col, row] = position;
  return (
    <div
      className="absolute"
      style={{
        top: `${row * 10}%`,
        left: `${col * 10}%`,
        width: '8%',
        height: '8%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2, // Ensure marker is on top
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100">
        <polygon points="50,0 100,100 0,100" fill="red" />
      </svg>
    </div>
  );
};

export default Marker;
