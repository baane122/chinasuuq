import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs against the REAL static export in `out/`, served by a plain
 * static server — not `next dev`. That is deliberate: the production artefact is
 * a static export (`output: "export"`, `trailingSlash: true`), and every bug this
 * suite exists to catch is invisible in dev mode, where Next serves a server
 * with its own routing.
 *
 * Two ways to run:
 *   npm run test:e2e          — serves out/ on a port and tests it (build first)
 *   BASE_URL=https://chinasuuq.com npx playwright test   — tests the live site
 *
 * The suite never writes to the database and never needs a password: it asserts
 * on public pages, the auth gate, and network-failure behaviour that is driven by
 * route interception.
 */
const PORT = Number(process.env.E2E_PORT ?? 4317);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;
const useExternal = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  // A static export has no server state, so tests are independent; running them
  // in parallel keeps CI honest about total time.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["github"], ["line"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // The app ships a CSP that forbids inline scripts from unknown origins; the
    // export is same-origin so nothing here needs to be relaxed.
    serviceWorkers: "block",
  },
  projects: [
    {
      // Runs installed Google Chrome rather than Playwright's bundled Chromium.
      // Two reasons: the bundled download is a ~150 MB network dependency on
      // every fresh CI run, and the audience for this site is on real Chrome /
      // Android WebView — testing the same engine they run is the point.
      // GitHub's ubuntu-latest image ships google-chrome stable. Override with
      // PLAYWRIGHT_CHANNEL=chromium if a self-hosted runner has no Chrome.
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        // `channel` WINS over `executablePath` in Playwright, so it must be
        // omitted entirely when an explicit binary is supplied — otherwise the
        // escape hatch below silently does nothing and Chrome is launched again.
        ...(process.env.PLAYWRIGHT_EXECUTABLE
          ? {}
          : { channel: (process.env.PLAYWRIGHT_CHANNEL ?? "chrome") as "chrome" | "chromium" }),
        // Escape hatch for a machine where the browser cannot spawn its
        // multi-process children (a hardened sandbox answers Chrome's Mach
        // bootstrap with EPERM). Point these at any Chrome/Chromium build:
        //   PLAYWRIGHT_EXECUTABLE=/path/to/chrome-headless-shell \
        //   PLAYWRIGHT_EXTRA_ARGS=--single-process npx playwright test
        launchOptions: {
          // `executablePath` is a launch option, not a top-level `use` field —
          // putting it at the top level is silently ignored and Playwright goes
          // back to its bundled headless shell.
          ...(process.env.PLAYWRIGHT_EXECUTABLE
            ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
            : {}),
          args: (process.env.PLAYWRIGHT_EXTRA_ARGS ?? "")
            .split(" ")
            .filter(Boolean),
        },
      },
    },
  ],
  webServer: useExternal
    ? undefined
    : {
        // `serve`-free static server: Node's own http module, so CI needs no
        // extra dependency or global install.
        command: `node scripts/serve-export.mjs --port ${PORT} --dir out`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
