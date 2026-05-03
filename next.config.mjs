/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  serverExternalPackages: ["onnxruntime-node"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("onnxruntime-node");
    } else {
      config.resolve.alias["onnxruntime-node"] = false;
    }
    return config;
  },
};

export default nextConfig;
