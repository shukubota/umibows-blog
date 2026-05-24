/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  eslint: {
    // Pre-existing lint debt in unrelated routes blocks production builds.
    // Lint is still enforced via `npm run lint` and CI.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
