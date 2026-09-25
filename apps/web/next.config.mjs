/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mashupkgrid/shared"],
  // Lets a second dev server run from the same checkout (e.g. against a test API) without the two
  // overwriting each other's build output. Unset, this is Next's default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
