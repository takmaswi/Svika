import { expect, test } from "@playwright/test";

test("fleet dashboard renders for Baba Tino", async ({ page }) => {
  await page.goto("/fleet?as=baba_tino");
  await expect(page.getByText(/Fleet/)).toBeVisible();
  await expect(page.getByText(/Today's revenue/)).toBeVisible();
  await expect(page.getByText(/Ghost Trip audit/)).toBeVisible();
  await expect(page.getByText(/ZIMRA liability/)).toBeVisible();
});
