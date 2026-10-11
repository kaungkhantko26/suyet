import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("private routes require login and keep the destination", async ({ page }) => {
  for (const path of ["/dashboard", "/organizer/dashboard", "/admin", "/admin/users"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/auth/login\\?next=`));
  }
});

test("students are denied organizer and admin areas", async ({ page }) => {
  await login(page, "student");
  for (const path of ["/admin", "/admin/events", "/organizer/dashboard", "/organizer/events/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  }
});

test("organizers cannot open the admin area but can open organizer pages", async ({ page }) => {
  await login(page, "organizer");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/organizer/dashboard");
  await expect(page.getByRole("heading", { name: "Organizer dashboard" })).toBeVisible();
});

test("each role lands in its own dashboard and students never see event creation", async ({ page }) => {
  await login(page, "student");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "New event" })).toHaveCount(0);
  await page.goto("/organizer/events/new");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("organizers are redirected from the student dashboard to their own workspace", async ({ page }) => {
  await login(page, "organizer");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/organizer\/dashboard/);
  await expect(page.getByRole("heading", { name: "Organizer dashboard" })).toBeVisible();
});

test("the internal n8n endpoint is closed to browsers without the secret", async ({ request }) => {
  const r = await request.post("/api/internal/event-candidates", { data: { title: "x", sourceUrl: "https://example.org" } });
  expect(r.status()).toBe(401);
});

test("private and privileged APIs deny anonymous callers", async ({ request }) => {
  expect((await request.get("/api/account/export")).status()).toBe(401);
  expect((await request.post("/api/internal/cron")).status()).toBe(401);
});

test("moderators reach review pages but not user management, organizer management or settings", async ({ page }) => {
  await login(page, "moderator");
  await page.goto("/admin/submissions");
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  for (const path of ["/admin/users", "/admin/organizers", "/admin/categories", "/admin/settings", "/admin/security", "/admin/analytics"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden/);
  }
  await page.goto("/organizer/events/new");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("privileged accounts cannot skip two-factor: a password alone grants no admin access", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("admin@demo.letstech.test");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/auth\/mfa/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/mfa/); // still gated
  await page.goto("/organizer/dashboard");
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code is not valid.")).toBeVisible();
});

test("security headers and a strict CSP are served, and pages load without CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toContain("base-uri 'self'");
  expect(h["content-security-policy"]).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBeTruthy();
  expect(h["permissions-policy"]).toBeTruthy();
  expect(h["x-request-id"]).toBeTruthy();
  for (const p of ["/events", "/events/demo-ai-sprint", "/calendar", "/auth/login", "/organizers"]) { await page.goto(p); await page.waitForLoadState("networkidle"); }
  await page.getByRole("button", { name: "မြန်မာ" }).first().click();
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});

test("stored XSS payloads in event titles are rendered as text, never executed", async ({ browser }) => {
  const title = `<img src=x onerror="window.__xss=1"> Payload ${Date.now()}`;
  const org = await (await browser.newContext()).newPage();
  await login(org, "organizer");
  await org.goto("/organizer/events/new");
  await org.getByLabel("Title").first().fill(title);
  await org.getByLabel("Short description").fill("<script>window.__xss=1</script>");
  await org.getByLabel("Full description").fill("<svg onload=window.__xss=1>");
  await org.getByLabel("Robotics").check();
  await org.getByLabel("Start (Myanmar Time)").fill("2030-05-10T09:00");
  await org.locator("#format").selectOption("ONLINE");
  await org.getByLabel("Online event link").fill("https://example.org/xss");
  await org.getByRole("button", { name: "Submit for review" }).click();
  await org.waitForURL(/\/organizer\/events$/);
  await expect(org.getByText("Payload")).toBeVisible();
  expect(await org.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin");
  await admin.goto("/admin/submissions");
  const card = admin.locator("li", { hasText: "Payload" });
  await expect(card).toBeVisible();
  expect(await admin.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await card.getByRole("button", { name: "Approve & publish" }).click();
  const visitor = await (await browser.newContext()).newPage();
  let dialog = false;
  visitor.on("dialog", () => { dialog = true; });
  await visitor.goto("/events?q=Payload");
  await expect(visitor.getByText("Payload").first()).toBeVisible();
  await visitor.getByText("Payload").first().click();
  await visitor.waitForLoadState("networkidle");
  expect(await visitor.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(dialog).toBe(false);
  expect(await visitor.locator("img[src='x']").count()).toBe(0);
});

test("session cookie is HttpOnly, Secure and SameSite", async ({ page, context }) => {
  await login(page, "student");
  const c = (await context.cookies()).find((x) => x.name === "lte_session")!;
  expect(c).toBeTruthy();
  expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("lte_session"); // not readable from JavaScript
});

test("admin sees the security dashboard with emergency controls and risk reports", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/security");
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(page.getByText("Emergency controls")).toBeVisible();
  await expect(page.getByRole("button", { name: /Disable event submissions/ })).toBeVisible();
  await expect(page.getByText("Event risk reports")).toBeVisible();
  await expect(page.getByText(/no bulk-approve/i)).toBeVisible();
});
