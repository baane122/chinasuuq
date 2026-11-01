import { test, expect } from "@playwright/test";
import { stubTracking, stubOffline, trackingRow } from "./helpers";

/**
 * /track — the public order-tracking page, in a real browser against the real
 * static export (`out/`, served the way Vercel serves it).
 *
 * The offline `verify:track` suite can only exercise the classifier. These tests
 * cover the wiring around it: which state the page paints, what the customer is
 * told, and — the bug that started this — that an unreachable server is never
 * drawn as "order not found".
 *
 * Every Supabase call is intercepted, so the suite is deterministic and offline.
 */

test.describe("/track", () => {
  test("renders the search affordance and gates the button on input", async ({ page }) => {
    const response = await page.goto("/track/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/ChinaSuuq/i);
    await expect(page.getByRole("heading", { name: /where'?s my order/i })).toBeVisible();

    const input = page.getByLabel("Order reference");
    const button = page.getByRole("button", { name: /^Track$/i });
    await expect(input).toBeVisible();
    await expect(button).toBeDisabled();

    await input.fill("   "); // whitespace only is still "empty"
    await expect(button).toBeDisabled();

    await input.fill("CS-2026-00125");
    await expect(button).toBeEnabled();
  });

  test("a known reference renders the order and its timeline", async ({ page }) => {
    await stubTracking(page, [trackingRow()]);
    await page.goto("/track/");
    await page.getByLabel("Order reference").fill("CS-2026-00125");
    await page.getByRole("button", { name: /^Track$/i }).click();

    await expect(page.getByText("CS-2026-00125").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/mogadishu/i).first()).toBeVisible();
    await expect(page.getByText(/order not found/i)).toHaveCount(0);
    await expect(page.getByText(/could not reach the server/i)).toHaveCount(0);
  });

  test("an unknown reference says 'not found' — and never 'could not reach'", async ({
    page,
  }) => {
    await stubTracking(page, []);
    await page.goto("/track/");
    await page.getByLabel("Order reference").fill("NO-SUCH-ORDER");
    await page.getByRole("button", { name: /^Track$/i }).click();

    await expect(page.getByText(/order not found/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/could not reach the server/i)).toHaveCount(0);
  });

  test("a dead network says 'could not reach the server', never 'not found'", async ({
    page,
  }) => {
    await stubOffline(page);
    await page.goto("/track/");
    await page.getByLabel("Order reference").fill("CS-2026-00125");
    await page.getByRole("button", { name: /^Track$/i }).click();

    await expect(page.getByText(/could not reach the server/i)).toBeVisible({
      timeout: 20_000,
    });
    // The regression this suite exists for: the page used to answer "Order not
    // found" for both, telling a paid customer their order did not exist.
    await expect(page.getByText(/order not found/i)).toHaveCount(0);
  });

  test("a 5xx from the gateway is unreachable, not not-found", async ({ page }) => {
    await page.route("**/rest/v1/order_tracking_public**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
    );
    await page.goto("/track/");
    await page.getByLabel("Order reference").fill("CS-2026-00125");
    await page.getByRole("button", { name: /^Track$/i }).click();

    await expect(page.getByText(/could not reach the server/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/order not found/i)).toHaveCount(0);
  });

  test("pressing Enter searches the same way the button does", async ({ page }) => {
    await stubTracking(page, []);
    await page.goto("/track/");
    const input = page.getByLabel("Order reference");
    await input.fill("NO-SUCH-ORDER");
    await input.press("Enter");
    await expect(page.getByText(/order not found/i)).toBeVisible({ timeout: 15_000 });
  });

  test("offers the header, footer and the WhatsApp escape hatch", async ({ page }) => {
    await page.goto("/track/");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator('a[href*="wa.me"]').first()).toHaveAttribute("href", /wa\.me\/\d+/);
  });

  test("the APK download is offered from the public site", async ({ page }) => {
    await page.goto("/");
    // The landing page is the only route that advertises the Android build; a
    // broken href here is a dead install path that nothing else checks at runtime.
    await expect(page.locator('a[href="/app/chinasuuq.apk"]').first()).toBeVisible();
  });
});
