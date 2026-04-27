import { expect, test } from "@playwright/test";

test("whatsapp companion renders three commands", async ({ page }) => {
  await page.goto("/wa?as=takunda");
  await expect(page.getByText(/balance/)).toBeVisible();
  await expect(page.getByText(/kombi near me/)).toBeVisible();
  await expect(page.getByText(/transfer/)).toBeVisible();
});
