import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest is the plain unit runner for pure modules and for the parts of the app
 * that can be executed without a browser. It is deliberately NOT a replacement
 * for the `verify:*` contract gates (those compare source against a live schema
 * snapshot and have no assertions Playwright-style tests could express), and it
 * is not a replacement for `e2e/` (that is the only layer that runs the built
 * export in a real browser).
 *
 * The point is to have somewhere normal to put a unit test, so the next bug does
 * not need another bespoke 300-line .mjs in scripts/.
 *
 *   npm run test:unit         → once
 *   npm run test:unit:watch   → watch
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "out", "e2e"],
    environment: "node",
    globals: false,
    reporters: process.env.CI ? ["github", "default"] : ["default"],
    // Nothing here touches the network; a test that hangs is a bug in the test.
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
