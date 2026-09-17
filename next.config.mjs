/** @type {import('next').NextConfig} */
const nextConfig = {
  // React-Leaflet 4 can initialize the same map node twice during Strict Mode remounts.
  reactStrictMode: false,
  async rewrites() {
    return [{ source: '/data/:path*', destination: `${process.env.JSON_SERVER_URL || 'http://127.0.0.1:3101'}/:path*` }]
  },
}

export default nextConfig
