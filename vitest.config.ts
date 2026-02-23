import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import { resolve } from "node:path";

// Load .env.test before vitest workers are spawned so that
// describe.skipIf(!process.env.XAI_API_KEY) evaluates correctly.
dotenv.config({ path: resolve(process.cwd(), ".env.test") });

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    env: {
      // Propagate to worker threads
      XAI_API_KEY: process.env.XAI_API_KEY ?? "",
    },
  },
});
