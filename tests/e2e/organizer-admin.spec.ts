import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("organizer submits an event, admin approves it, and it becomes public", async ({ browser }) => {
  const title = `E2E Robotics Jam ${Date.now()}`;

  // Organizer creates and submits
  const org = await (await browser.newContext()).newPage();
  await login(org, "organizer");
  await org.goto("/organizer/events/new");
  await org.getByLabel("Title").first().fill(title);
  await org.getByLabel("Short description").fill("A short e2e description");
  await org.getByLabel("Full description").fill("A longer e2e description for the review flow.");
  await org.getByLabel("Robotics").check();
  await org.getByLabel("Start (Myanmar Time)").fill("2030-05-10T09:00");
  await org.locator("#format").selectOption("ONLINE");
  await org.getByLabel("Online event link").fill("https://example.org/e2e-live");
  await org.getByLabel("Official source URL").fill("https://example.org/e2e-source");
  await org.getByLabel("Registration URL").fill("https://example.org/e2e-register");
  await org.getByRole("button", { name: "Submit for review" }).click();
  await org.waitForURL(/\/organizer\/events$/);
  await expect(org.getByText(title)).toBeVisible();
  await expect(org.getByText("Pending review")).toBeVisible();

  // Unapproved events stay hidden
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/events?q=${encodeURIComponent("E2E Robotics Jam")}`);
  await expect(visitor.getByText("No events found.")).toBeVisible();

  // Admin approves
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin");
  await admin.goto("/admin/submissions");
  const card = admin.locator("li", { hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve & publish" }).click();
  await expect(admin.locator("li", { hasText: title })).toHaveCount(0);

  // Now it is public and searchable, dates shown in Myanmar Time
  await visitor.goto(`/events?q=${encodeURIComponent("E2E Robotics Jam")}`);
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(visitor.getByText("09:00").first()).toBeVisible();
});

test("admin can verify an event only with an official source and the badge reflects it", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/events?q=Capture");
  const card = page.locator("li", { hasText: "Demo Capture The Flag Night" });
  await card.getByText(/Mark verified/).click();
  await card.getByRole("combobox", { name: "Status" }).selectOption("VERIFIED");
  await card.getByRole("button", { name: "Update" }).click();
  await expect(card.getByText("Verified").first()).toBeVisible();
  await page.goto("/events/demo-ctf");
  await expect(page.getByText("Verified").first()).toBeVisible();
});
