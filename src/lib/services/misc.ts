import { Prisma, type AnalyticsType } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { enqueue } from "../jobs";
import { randomToken } from "../password";
import { rateLimit } from "../rate-limit";

/** Privacy-conscious analytics: no user id, IP or user agent is ever stored. */
export async function track(type: AnalyticsType, data: { eventId?: string; categorySlug?: string; query?: string } = {}) {
  try {
    await db.analyticsEvent.create({
      data: { type, eventId: data.eventId, categorySlug: data.categorySlug, query: data.query?.toLowerCase().slice(0, 80) },
    });
  } catch {
    /* analytics must never break a request */
  }
}

export async function subscribeNewsletter(email: string, locale: string, ip: string): Promise<"ok" | "tooMany"> {
  const rl = await rateLimit(`newsletter:${ip}`, 5, 3600);
  if (!rl.allowed) return "tooMany";
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
  const sub = existing ?? (await db.newsletterSubscriber.create({ data: { email, locale, unsubscribeToken: randomToken(24) } }));
  if (existing?.confirmedAt && !existing.unsubscribedAt) return "ok"; // never reveal subscription state
  if (existing?.unsubscribedAt) await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { unsubscribedAt: null, confirmedAt: null } });
  await enqueue("email", {
    to: email,
    subject: `Confirm your subscription · ${config.brandName}`,
    text: `Confirm your subscription to ${config.brandName} updates:\n${config.appUrl}/newsletter/confirm?token=${sub.unsubscribeToken}\n\nIf you didn't ask for this, ignore this email.`,
  });
  return "ok";
}

export async function confirmNewsletter(token: string) {
  const r = await db.newsletterSubscriber.updateMany({ where: { unsubscribeToken: token }, data: { confirmedAt: new Date(), unsubscribedAt: null } });
  return r.count > 0;
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    db.newsletterSubscriber.updateMany({ where: { unsubscribeToken: token }, data: { unsubscribedAt: new Date() } }),
    db.notificationPreference.updateMany({ where: { unsubscribeToken: token }, data: { emailEnabled: false } }),
  ]);
  return a.count + b.count > 0;
}

export const json = (v: unknown) => v as Prisma.InputJsonValue;
