import { expect, type Page } from "@playwright/test";
import { DEMO_MFA_SECRET } from "../../prisma/reference-data";
import { base32Decode, hotp, totpStep } from "../../src/lib/security/totp";

// Local seed accounts (prisma/seed.ts, development only). Staff accounts must pass TOTP, exactly like in production.
export const ACCOUNTS = {
  admin: { email: "admin@demo.letstech.test", password: "demo-password-123", mfa: true },
  moderator: { email: "moderator@demo.letstech.test", password: "demo-password-123", mfa: true },
  organizer: { email: "organizer@demo.letstech.test", password: "demo-password-123", mfa: false },
  student: { email: "student@demo.letstech.test", password: "demo-password-123", mfa: false },
};

const lastStep = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A TOTP code that the server will accept and that we have not already used (the server rejects reuse of a step). */
async function freshCode(user: string): Promise<string> {
  const secret = base32Decode(DEMO_MFA_SECRET);
  for (let tries = 0; tries < 40; tries++) {
    const now = totpStep();
    for (const step of [now, now + 1, now - 1]) {
      if (step > (lastStep.get(user) ?? 0)) { lastStep.set(user, step); return hotp(secret, step); }
    }
    await sleep(1000);
  }
  throw new Error("no fresh TOTP step available");
}

export async function login(page: Page, who: keyof typeof ACCOUNTS, landing: RegExp = /\/dashboard/) {
  const a = ACCOUNTS[who];
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(a.email);
  await page.getByLabel("Password").fill(a.password);
  await page.getByRole("button", { name: "Log in" }).click();
  if (a.mfa) {
    await page.waitForURL(/\/auth\/mfa/);
    await page.getByLabel("Verification code").fill(await freshCode(who));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL(landing);
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
