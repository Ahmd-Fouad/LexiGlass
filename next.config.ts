import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // The SQLite database lives inside the project; keep writes to it from
      // triggering hot reloads mid-session.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/prisma/dev.db*"],
      };
    }
    return config;
  },
};

export default nextConfig;
