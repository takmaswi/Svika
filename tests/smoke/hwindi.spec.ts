import { expect, test } from "@playwright/test";

test("hwindi conductor screen renders", async ({ page }) => {
  await page.goto("/hwindi?as=farai");
  await expect(page.getByText(/Hwindi/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Cash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Parcel" })).toBeVisible();
});
