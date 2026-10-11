import { expect, test } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

for (const path of ["/", "/events", "/events/demo-ai-sprint", "/calendar", "/organizers", "/auth/login", "/auth/register/organizer"]) {
  test(`no horizontal overflow on mobile: ${path}`, async ({ page }) => {
    await page.goto(path);
    await noHorizontalOverflow(page);
  });
}

test("mobile menu opens full screen, closes with Esc, and links work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Hackathons" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await dialog.getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/\/calendar/);
});

test("filters work in the mobile drawer", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: /Filters/ }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByRole("button", { name: "Hackathons" }).click();
  await expect(page).toHaveURL(/category=hackathons/);
  await expect(drawer.getByRole("button", { name: "Hackathons", pressed: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Show results" }).click();
  await expect(page.getByRole("link", { name: "Demo Campus Hackathon 24h" })).toBeVisible();
});

test("single-value pill groups toggle via the 'Any' option", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: /Filters/ }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByRole("button", { name: "Free", exact: true }).click();
  await expect(page).toHaveURL(/fee=free/);
  await drawer.getByRole("button", { name: "Any", exact: true }).first().click();
  await expect(page).not.toHaveURL(/fee=/);
});

test("touch targets are at least 44px for primary controls", async ({ page }) => {
  await page.goto("/events");
  for (const loc of [page.getByRole("button", { name: "Menu" }), page.getByRole("button", { name: /Filters/ }), page.getByRole("button", { name: "Search" })]) {
    const box = await loc.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
  }
});
