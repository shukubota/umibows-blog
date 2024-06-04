import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold mb-4">Welcome to My Blog</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 max-w-sm mx-auto bg-white rounded-xl shadow-md flex items-center space-x-4">
            <div className="flex-shrink-0">
              <Image className="h-12 w-12" src="/vercel.svg" alt="Blog Logo" width={48} height={48} />
            </div>
            <div>
              <div className="text-xl font-medium text-black">Blog Post One</div>
              <p className="text-gray-500">You have a new message!</p>
            </div>
          </div>
          <div className="p-6 max-w-sm mx-auto bg-white rounded-xl shadow-md flex items-center space-x-4">
            <div className="flex-shrink-0">
              <Image className="h-12 w-12" src="/vercel.svg" alt="Blog Logo" width={48} height={48} />
            </div>
            <div>
              <div className="text-xl font-medium text-black">Blog Post Two</div>
              <p className="text-gray-500">You have a new message!</p>
            </div>
          </div>
          {/* Add more blog posts as needed */}
        </div>
      </div>
    </main>
  );
}
