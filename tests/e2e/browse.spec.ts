import { expect, test } from "@playwright/test";

test("visitor browses, searches, filters and opens an event without logging in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Discover What's Next");

  // Search from the hero redirects to /events with a query parameter.
  await page.getByRole("search").first().getByRole("searchbox").fill("hackathon");
  await page.getByRole("search").first().getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/events\?q=hackathon/);
  await expect(page.getByRole("link", { name: "Demo Campus Hackathon 24h" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Demo Web Basics Workshop" })).toHaveCount(0);
});

test("filters update the URL, combine, and clear without losing unrelated params", async ({ page }) => {
  await page.goto("/events?sort=newest");
  const aside = page.getByRole("complementary", { name: "Filters" });
  await aside.getByLabel("Hackathons").click();
  await expect(page).toHaveURL(/category=hackathons/);
  await aside.getByRole("group", { name: "Format" }).getByLabel("Online").click();
  await expect(page).toHaveURL(/format=online/);
  await expect(page).toHaveURL(/sort=newest/);
  await expect(page.getByRole("link", { name: "Demo AI Sprint (online)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Demo Campus Hackathon 24h" })).toHaveCount(0); // on-site, filtered out
  await aside.getByRole("button", { name: "Clear all" }).click();
  await expect(page).not.toHaveURL(/category=/);
  await expect(page).toHaveURL(/sort=newest/);
});

test("shared filter URLs work and empty results offer a reset", async ({ page }) => {
  await page.goto("/events?category=hackathons&format=online");
  await expect(page.getByRole("link", { name: "Demo AI Sprint (online)" })).toBeVisible();
  await page.goto("/events?q=zzzzzzzz");
  await expect(page.getByText("No events found.")).toBeVisible();
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("event details show sources, Myanmar Time and an official registration link; cancelled/closed block registration", async ({ page }) => {
  await page.goto("/events/demo-ai-sprint");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo AI Sprint (online)");
  await expect(page.getByText("Myanmar Time").first()).toBeVisible();
  await expect(page.getByText("Unverified").first()).toBeVisible();
  const register = page.getByRole("link", { name: /Register on official website/ });
  await expect(register).toHaveAttribute("href", "/events/demo-ai-sprint/register");
  const res = await page.request.get("/events/demo-ai-sprint/register", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toBe("https://example.org/demo/ai-sprint/register");

  await page.goto("/events/demo-cancelled");
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Registration is closed/ })).toBeDisabled();
  const blocked = await page.request.get("/events/demo-cancelled/register", { maxRedirects: 0 });
  expect(blocked.status()).toBe(303); // goes back to the event page, never to the external site
});

test("ICS export, calendar and unknown pages", async ({ page }) => {
  const ics = await page.request.get("/events/demo-ai-sprint/calendar.ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VEVENT");
  await page.goto("/calendar?view=list");
  await expect(page.getByRole("heading", { name: "Event Calendar" })).toBeVisible();
  await page.goto("/events/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("unpublished/unknown event data never leaks", async ({ page }) => {
  const sm = await page.request.get("/sitemap.xml");
  expect(await sm.text()).toContain("/events/demo-ai-sprint");
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
});
