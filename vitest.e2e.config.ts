import { defineConfig } from "vitest/config";

/**
 * E2E tests run over a *real* anvil JSON-RPC (started/stopped by globalSetup below), driving the
 * actual deployed bytecode - not just the Foundry test suite's understanding of it. `singleFork`
 * keeps every e2e test file in one worker process so they share the one anvil instance on port
 * 8547 rather than each spawning its own.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    globalSetup: ["test/e2e/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
