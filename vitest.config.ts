import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    // Every test in this repo must pass with no network at all: the dev sandbox
    // cannot reach any Portuguese government domain, so anything that quietly
    // depended on live HTTP would pass in CI and fail here (or vice versa).
    environment: "node",
    globals: false,
  },
});
