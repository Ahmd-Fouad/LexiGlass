import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // When running on the local SQLite option, the database file lives
      // inside the project; keep writes to it from triggering hot reloads.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/prisma/dev.db*"],
      };
    }
    return config;
  },
};

export default nextConfig;
