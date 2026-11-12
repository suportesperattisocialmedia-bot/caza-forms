/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [{ source: "/sb/:path*", destination: "https://kmgyfdfjqrneiqtfgeha.supabase.co/:path*" }];
  },
};
export default nextConfig;
