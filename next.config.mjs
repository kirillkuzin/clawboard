/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_OPENCLAW_API_URL: process.env.OPENCLAW_API_URL || 'http://localhost:8000',
  },
};

export default nextConfig;
