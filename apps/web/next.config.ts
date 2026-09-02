import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages are consumed as TypeScript source rather than built
  // output, so Next has to compile them itself.
  transpilePackages: ["@apoios/core"],
  reactStrictMode: true,
};

export default config;
