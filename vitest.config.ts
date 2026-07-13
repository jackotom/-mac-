import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    },
    globals: true,
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ["tests/setup.ts"]
  }
});
