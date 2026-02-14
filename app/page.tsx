import Link from "next/link";

export default function Home() {
  const blogs = [
    { id: "image-generator", title: "AI Image Generator", path: "/image-generator" },
    { id: "tex", title: "TeX Previewer", path: "/tex" },
    { id: "langtons-ant", title: "Langton's Ant Simulation", path: "/langtons-ant" },
    { id: "double-pendulum", title: "Double Pendulum Simulation", path: "/double-pendulum" },
    { id: "numerical-comparison", title: "Numerical Integration Comparison (Euler vs RK4)", path: "/numerical-comparison" },
    { id: "lorenz", title: "Lorenz Attractor Simulation", path: "/lorenz" },
    { id: "igo", title: "Igo (Go Game)", path: "/igo" },
    { id: "weather-map", title: "Weather Map (Windy)", path: "/weather-map" },
    { id: 2, title: "Second Blog Post", path: "/blog/2" },
    { id: 3, title: "Third Blog Post", path: "/blog/3" },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="w-full max-w-3xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-black dark:text-white">Blog List</h1>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            Profile
          </Link>
        </div>
        <ul className="space-y-4">
          {blogs.map((blog) => (
            <li key={blog.id} className="p-4 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Link href={blog.path || `/blog/${blog.id}`} className="text-xl font-semibold text-black dark:text-white">
                {blog.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
