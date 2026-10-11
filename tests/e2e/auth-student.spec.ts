import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("student signs up, saves an event, sees it in the dashboard, and removes it", async ({ page }) => {
  const email = `student-${Date.now()}@e2e.example`;
  await page.goto("/auth/register");
  await page.getByLabel("Full name").fill("E2E Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Please verify your email address")).toBeVisible();

  await page.goto("/events/demo-ai-sprint");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/events/demo-ai-sprint"));
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("button", { name: "Remove from saved" })).toBeVisible();
  await saved; // let the server action finish before navigating away

  await page.goto("/dashboard/saved");
  await expect(page.getByRole("link", { name: "Demo AI Sprint (online)" })).toBeVisible();
  const removed = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Remove from saved" }).click();
  await removed;
  await page.reload();
  await expect(page.getByText("You have not saved any events yet.")).toBeVisible();
});

test("anonymous users are sent to login when saving; invalid logins fail safely", async ({ page }) => {
  await page.goto("/events/demo-ai-sprint");
  await page.getByRole("link", { name: "Log in to save events" }).first().click();
  await expect(page).toHaveURL(/\/auth\/login\?next=/);
  await page.getByLabel("Email").fill("nobody@e2e.example");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("student preferences persist", async ({ page }) => {
  await login(page, "student");
  await page.goto("/dashboard/preferences");
  await page.getByLabel("Cybersecurity").check();
  await page.getByLabel("Online events only").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Cybersecurity")).toBeChecked();
  await expect(page.getByLabel("Online events only")).toBeChecked();
});
