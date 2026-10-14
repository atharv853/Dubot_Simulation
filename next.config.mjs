/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents double mount canvas re-inits in dev mode
  transpilePackages: ['three'],
};

export default nextConfig;
