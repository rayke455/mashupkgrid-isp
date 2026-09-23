import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // The integration suite shares one real database; its files must not run in parallel.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
