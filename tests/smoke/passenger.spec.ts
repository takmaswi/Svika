import { expect, test } from "@playwright/test";

test.describe("passenger surface", () => {
  test("loads with default persona Tendai", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1", { hasText: "Svika" })).toBeVisible();
    await expect(page.getByText(/Tendai/)).toBeVisible();
  });

  test("respects ?as=rudo persona switch", async ({ page }) => {
    await page.goto("/?as=rudo");
    await expect(page.getByText(/Rudo/)).toBeVisible();
  });
});
