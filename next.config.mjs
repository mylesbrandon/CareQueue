/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    'http://192.168.1.129:3000',
    'http://localhost:3000',
  ],
};

export default nextConfig;
