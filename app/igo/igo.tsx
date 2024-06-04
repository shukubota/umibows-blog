'use client';

const Igo = () => {
  const lines = [];
  for (let i = 0; i < 9; i++) {
    lines.push(
      <div
        key={`v-${i}`}
        className="absolute bg-black"
        style={{
          top: `${(i + 1) * 10}%`,
          left: '10%',
          right: '10%',
          height: '1px',
        }}
      />,
      <div
        key={`h-${i}`}
        className="absolute bg-black"
        style={{
          top: '10%',
          bottom: '10%',
          left: `${(i + 1) * 10}%`,
          width: '1px',
        }}
      />
    );
  }

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="relative w-[80vw] h-[80vw] bg-board mt-[30rem]">
        {lines}
      </div>
    </div>
  );
};

export default Igo;
