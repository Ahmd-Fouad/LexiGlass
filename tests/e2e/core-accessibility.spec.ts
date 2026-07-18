import { expect, test } from "@playwright/test";

test("register, create a card, navigate by keyboard/mobile, and logout", async ({ page }) => {
  const email = `core-e2e-${Date.now()}@lexiglass.test`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("Core E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("playwright-passphrase");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByRole("main")).toHaveCount(1);

  await page.getByRole("link", { name: "Add your first card" }).click();
  await page.getByLabel("Word or phrase").fill("resilient");
  await page.getByLabel("Meaning").fill("able to recover quickly");
  await Promise.all([
    page.waitForURL("**/cards"),
    page.getByRole("button", { name: "Add card" }).click(),
  ]);
  await expect(page.getByText("resilient", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const more = page.getByRole("button", { name: "More" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "More features" }).getByRole("link", { name: /Progress/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");

  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");

  await Promise.all([
    page.waitForURL("**/login"),
    page.getByRole("button", { name: "Sign out" }).click(),
  ]);
});
