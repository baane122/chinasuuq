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
    // Vitest's built-in reporters are default / verbose / dot / junit / tap /
    // json / hanging-process. `github` is a PLAYWRIGHT reporter name and does
    // not exist here — asking for it fails the run with "Cannot find package
    // 'github'", which is how the first CI attempt died. `verbose` gives one
    // line per test, which reads the same way in the Actions log.
    reporters: process.env.CI ? ["verbose"] : ["default"],
    // Nothing here touches the network; a test that hangs is a bug in the test.
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
