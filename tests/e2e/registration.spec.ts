import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const SLUG = "demo-onsite-registration";

test("anonymous visitors must log in before registering; the page offers on-site registration, not another website", async ({ page }) => {
  await page.goto(`/events/${SLUG}`);
  const cta = page.getByRole("link", { name: "Register now" });
  await expect(cta).toHaveAttribute("href", `/events/${SLUG}/apply`);
  await expect(page.getByText("no other website needed")).toBeVisible();
  await page.goto(`/events/${SLUG}/apply`);
  await expect(page).toHaveURL(/\/auth\/login\?next=/);
});

test("student fills the registration form on this website; organizer sees the response and exports it", async ({ browser }) => {
  // ── student registers
  const student = await (await browser.newContext()).newPage();
  await login(student, "student");
  await student.goto(`/events/${SLUG}`);
  await student.getByRole("link", { name: "Register now" }).click();
  await expect(student.getByRole("heading", { level: 1 })).toContainText("Register for Demo On-Site Registration Workshop");
  await expect(student.getByText("spots left")).toBeVisible();

  // consent is required before submitting
  await student.getByLabel(/University or school/).fill("=HYPERLINK(\"http://evil.example\")");
  await student.getByLabel("Beginner").check();
  await student.getByRole("button", { name: "Submit registration" }).click();
  await expect(student.getByText("Please agree to share your answers")).toBeVisible();

  await student.getByLabel(/I agree to share my name/).check();
  await student.getByLabel("Web").check();
  await student.getByRole("button", { name: "Submit registration" }).click();
  await expect(student.getByText("Waiting for the organizer's decision")).toBeVisible();

  // not yet approved: the dashboard says so
  await student.goto("/dashboard/registrations");
  await expect(student.getByRole("link", { name: "Demo On-Site Registration Workshop" })).toBeVisible();
  await expect(student.getByText("Pending review").first()).toBeVisible();

  // ── organizer sees it
  const org = await (await browser.newContext()).newPage();
  await login(org, "organizer");
  await org.goto("/organizer/events");
  const card = org.locator("li", { hasText: "Demo On-Site Registration Workshop" });
  await card.getByRole("link", { name: "Registration form" }).click();
  await expect(org.getByRole("heading", { name: "Registration form", level: 1 })).toBeVisible();
  await expect(org.getByText("Demo Student")).toBeVisible();
  await expect(org.getByText("student@demo.letstech.test")).toBeVisible();
  await expect(org.getByText("Pending review").first()).toBeVisible();

  // organizer decides: rejection needs a reason, approval can carry a message
  const row = org.locator("li", { hasText: "student@demo.letstech.test" });
  await row.getByRole("button", { name: "Reject" }).click();
  await expect(row.getByText("Please add a short reason")).toBeVisible();
  await row.getByLabel(/Message to the participant/).fill("Bring your laptop and student card.");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByText("Approved").first()).toBeVisible();

  // CSV: authorised download, formula neutralised
  const url = org.url().replace("/registration", "/registrations.csv");
  const csv = await org.request.get(url);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("University or school");
  expect(body).toContain("'=HYPERLINK");

  // …but the student (a participant, not the organizer) cannot download anyone's data
  const denied = await student.request.get(url);
  expect(denied.status()).toBe(403);

  // ── the student is told they may participate
  await student.goto("/dashboard/notifications");
  await expect(student.getByRole("link", { name: /you can participate/i }).first()).toBeVisible();
  await student.goto("/dashboard/registrations");
  await expect(student.getByText(/Approved: you can participate/).first()).toBeVisible();
  await expect(student.getByText("Bring your laptop and student card.")).toBeVisible();
  await student.goto(`/events/${SLUG}/apply`);
  await expect(student.getByText("Approved: you are allowed to participate.")).toBeVisible();
  await expect(student.getByText("Check your email for the joining details")).toBeVisible();
});

test("the apply page shows who organizes the event and lets the student edit their profile", async ({ page }) => {
  await login(page, "student");
  await page.goto(`/events/${SLUG}/apply`);
  await expect(page.getByText("Organized by")).toBeVisible();
  await expect(page.getByRole("link", { name: "View organizer profile" })).toBeVisible();
  await page.getByRole("link", { name: "Edit my profile" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile/);
  await page.getByLabel("Display name").fill("Demo Student Renamed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto(`/events/${SLUG}/apply`);
  await expect(page.getByText("Demo Student Renamed").first()).toBeVisible(); // the profile name is what organizers see (header, menu and card all update)
});

test("organizer builds a form like Google Forms; sensitive questions are refused", async ({ page }) => {
  await login(page, "organizer");
  await page.goto("/organizer/events");
  await page.locator("li", { hasText: "Demo On-Site Registration Workshop" }).getByRole("link", { name: "Registration form" }).click();

  await page.getByRole("button", { name: "Add question" }).click();
  const q = page.getByLabel("Question").last();
  await q.fill("What is your NRC number?");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/sensitive data/).first()).toBeVisible();

  await q.fill("Favourite programming language");
  await page.getByLabel("Answer type").last().selectOption("DROPDOWN");
  await page.getByLabel("Options").last().fill("Python\nJavaScript\nRust");
  await page.getByRole("checkbox", { name: "Required", exact: true }).last().check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // another student sees the new question on the apply page
  const s2 = await page.context().browser()!.newContext();
  const sp = await s2.newPage();
  await sp.goto("/auth/register");
  await sp.getByLabel("Full name").fill("Second Student");
  await sp.getByLabel("Email").fill(`second-${Date.now()}@e2e.example`);
  await sp.getByLabel("Password").fill("a-long-unusual-passphrase-77");
  await sp.getByRole("button", { name: "Create account" }).click();
  await sp.waitForURL(/\/dashboard/);
  await sp.goto(`/events/${SLUG}/apply`);
  await expect(sp.getByLabel(/Favourite programming language/)).toBeVisible();
  // unverified email: the server refuses and says why
  await sp.getByLabel(/University or school/).fill("UCSM");
  await sp.getByLabel("Beginner").check();
  await sp.getByLabel(/Favourite programming language/).selectOption("Rust");
  await sp.getByLabel(/I agree to share my name/).check();
  await sp.getByRole("button", { name: "Submit registration" }).click();
  await expect(sp.getByText(/verify your email/i)).toBeVisible();
});
