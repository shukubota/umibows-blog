/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // remote MCP(何切る)の View HTML を関数バンドルに同梱する
    // （fs.readFile で参照するため、トレースに明示的に含める）
    outputFileTracingIncludes: {
      "/api/mcp/mahjong-nanikiru/[transport]": ["./app/api/mcp/mahjong-nanikiru/hand.html"],
    },
  },
};

export default nextConfig;
