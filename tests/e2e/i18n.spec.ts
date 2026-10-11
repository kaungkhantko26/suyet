import { expect, test } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

test("Burmese interface: switch, persist across pages, correct lang and font, no overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "မြန်မာ" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "my");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("နည်းပညာ");
  await page.goto("/events");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("နည်းပညာပွဲများ");
  await expect(page.locator("li", { hasText: "Demo" }).getByText("စာရင်းသွင်းဖွင့်ထားသည်").first()).toBeVisible(); // status badge on a card
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.toLowerCase()).toContain("myanmar");
  await noHorizontalOverflow(page);
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ပွဲပြက္ခဒိန်");
  // Persists after reload and can be switched back.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "my");
  await page.getByRole("button", { name: "English" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
