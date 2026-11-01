import { test, expect } from "@playwright/test";
import { stubSignedOut, trackingRow } from "./helpers";

/**
 * /admin — Mission Control's gate, against the real static export.
 *
 * Everything about authorization here is client-side until Supabase answers, so
 * the risk is not "can they read the data" (RLS covers that) but "does the shell
 * appear to a stranger". Two bugs have shipped here before: the role gate read
 * `profiles.role` and let a deactivated staff member into an empty console, and
 * the nav painted before the session resolved.
 *
 * No credentials are used — a signed-in path is asserted only as far as the
 * UI can be driven without one.
 */

test.describe("admin login", () => {
  test("renders both fields, and keeps submit disabled until the form is valid", async ({
    page,
  }) => {
    const response = await page.goto("/admin/login/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: /mission control/i })).toBeVisible();
    const email = page.locator("#email");
    const password = page.locator("#password");
    const submit = page.getByRole("button", { name: /sign in to mission control/i });

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeDisabled();

    await email.fill("not-an-email"); // no @ and no dot
    await password.fill("long-enough-password");
    await expect(submit).toBeDisabled();

    await email.fill("someone@example.com");
    await password.fill("short"); // under the 6-char floor
    await expect(submit).toBeDisabled();

    await password.fill("long-enough-password");
    await expect(submit).toBeEnabled();
  });

  test("the password is masked and the reveal toggle works", async ({ page }) => {
    await page.goto("/admin/login/");
    const password = page.locator("#password");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("a rejected sign-in explains itself and stays on the login screen", async ({ page }) => {
    await stubSignedOut(page);

    await page.goto("/admin/login/");
    await page.locator("#email").fill("nobody@example.com");
    await page.locator("#password").fill("wrong-password-123");
    await page.getByRole("button", { name: /sign in to mission control/i }).click();

    // A failed sign-in must never navigate into the shell.
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: /mission control/i })).toBeVisible();
    // Some human-readable failure is required; the exact copy is the app's call.
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed|try again|could not/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the email field is a real email input with autocomplete for password managers", async ({
    page,
  }) => {
    await page.goto("/admin/login/");
    await expect(page.locator("#email")).toHaveAttribute("type", "email");
    await expect(page.locator("#email")).toHaveAttribute("autocomplete", "username");
    await expect(page.locator("#password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });
});

test.describe("admin shell gate", () => {
  test("a visitor with no session never sees admin navigation", async ({ page }) => {
    await stubSignedOut(page);
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });

    // Whichever way the app chooses to resolve it, the staff destinations must
    // not be reachable, and the visitor must end up at the login screen.
    for (const label of ["Customers", "Staff & Roles", "Payments"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
  });

  test("the shell does not paint navigation while the session read is pending", async ({
    page,
  }) => {
    // Hold every auth answer open: this is the "slow network" case where a
    // client-side gate is most likely to leak the UI.
    await page.route("**/auth/v1/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "no session" }),
      });
    });
    await page.route("**/rest/v1/rpc/auth_context**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });

    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    for (const label of ["Customers", "Staff & Roles", "Payments"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 25_000 });
  });
});

test.describe("deep links", () => {
  test("a protected sub-page is not readable without a session either", async ({ page }) => {
    await stubSignedOut(page);
    await page.goto("/admin/customers/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
    // Customer email addresses are the data this page would leak.
    await expect(page.locator("table")).toHaveCount(0);
  });

  test("/track is public and stays public", async ({ page }) => {
    await stubSignedOut(page);
    await page.goto("/track/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/track/);
    await expect(page.getByLabel("Order reference")).toBeVisible();
    void trackingRow;
  });
});
