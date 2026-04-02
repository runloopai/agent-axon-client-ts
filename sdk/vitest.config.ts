import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/types.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 75,
        lines: 80,
      },
    },
  },
});
