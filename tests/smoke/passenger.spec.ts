import { expect, test } from "@playwright/test";

test.describe("passenger surface", () => {
  test("landing offers Continue as Takunda", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Continue as Takunda/)).toBeVisible();
  });

  test("respects ?as=rudo direct deep-link", async ({ page }) => {
    await page.goto("/?as=rudo");
    await expect(page.getByText(/Rudo/)).toBeVisible();
  });
});
