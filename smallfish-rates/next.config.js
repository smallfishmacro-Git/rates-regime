/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow external API calls from server-side
  experimental: {
    serverActions: {
      allowedOrigins: ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'api.stlouisfed.org'],
    },
  },
};

module.exports = nextConfig;
