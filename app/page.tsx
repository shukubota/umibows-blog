import Link from "next/link";

export default function Home() {
  const blogs = [
    { id: "double-pendulum", title: "Double Pendulum Simulation", path: "/double-pendulum" },
    { id: 2, title: "Second Blog Post", path: "/blog/2" },
    { id: 3, title: "Third Blog Post", path: "/blog/3" },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="w-full max-w-3xl">
        <h1 className="text-4xl font-bold mb-8 text-black dark:text-white">Blog List</h1>
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
