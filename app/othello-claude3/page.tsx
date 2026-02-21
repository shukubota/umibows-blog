import OthelloGame from "./OthelloGame";

const Page = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">4x4 Othello Game</h1>
      <OthelloGame />
    </div>
  );
};

export default Page;
