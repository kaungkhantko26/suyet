"use server";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailField, text } from "@/lib/validation/common";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { subscribeNewsletter, track } from "@/lib/services/misc";
import { enqueue } from "@/lib/jobs";
import { getLocale } from "@/i18n/server";

export async function subscribeAction(email: string): Promise<ActionResult> {
  const parsed = emailField.safeParse(email);
  if (!parsed.success) return { ok: false, error: "validation.email" };
  const r = await subscribeNewsletter(parsed.data, await getLocale(), clientIp(await headers()));
  return r === "ok" ? { ok: true } : { ok: false, error: "auth.tooMany" };
}

const reportSchema = z.object({
  eventId: z.string().uuid(),
  reason: z.enum(["INCORRECT_DATE", "INCORRECT_LINK", "CANCELLED", "SCAM_OR_UNSAFE", "DUPLICATE", "OTHER"]),
  details: text(2000),
});

export async function reportEventAction(input: unknown): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation.required" };
  const user = await getCurrentUser();
  const ip = clientIp(await headers());
  const rl = await rateLimit(`report:${user?.id ?? ip}`, 5, 3600);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  const event = await db.event.findFirst({ where: { id: parsed.data.eventId, publishState: "PUBLISHED", deletedAt: null }, select: { id: true } });
  if (!event) return { ok: false, error: "common.error" };
  await db.eventReport.create({ data: { ...parsed.data, reporterId: user?.id } });
  return { ok: true, message: "report.sent" };
}

const contactSchema = z.object({ name: text(100), email: emailField, message: text(4000) });
export async function contactAction(input: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation.required" };
  const rl = await rateLimit(`contact:${clientIp(await headers())}`, 5, 3600);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  // Always persisted (visible in Admin → Settings); also emailed when CONTACT_EMAIL is configured.
  await db.contactMessage.create({ data: parsed.data });
  const to = process.env.CONTACT_EMAIL;
  if (to) await enqueue("email", { to, subject: `Contact form: ${parsed.data.name}`, text: `From: ${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}` });
  return { ok: true, message: "pages.contactSent" };
}

/** Records an outbound registration click and returns the validated destination (used by the redirect route). */
export async function trackSearchAction(query: string) {
  if (query.trim().length >= 2) await track("SEARCH", { query });
}

import { assertPermission } from "@/lib/auth/guards";
import { assessUrl } from "@/lib/security/url-risk";
import { recordSecurityEvent } from "@/lib/security/events";
import { ingestCandidate } from "@/lib/services/candidates";
import { isSwitchOn } from "@/lib/services/switches";
import { optText } from "@/lib/validation/common";
import { isSafeExternalUrl } from "@/lib/url";

const suggestionSchema = z.object({ title: text(200), url: z.string().trim().max(500), note: optText(500) });

/** Student event suggestion → an EventCandidate waiting in the human review queue (never published directly). */
export async function suggestEventAction(input: unknown): Promise<ActionResult> {
  let user;
  try { user = await assertPermission("suggestion.submit"); } catch { return { ok: false, error: "pages.unauthorizedBody" }; }
  if (await isSwitchOn("submissions_disabled")) return { ok: false, error: "pages.submissionsDisabled" };
  const parsed = suggestionSchema.safeParse(input);
  if (!parsed.success || !isSafeExternalUrl(parsed.data.url, { httpsOnly: true })) return { ok: false, error: "validation.url" };
  const rl = await rateLimit(`suggest:${user.id}`, 5, 86_400);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  const ind = assessUrl(parsed.data.url, "sourceUrl");
  if (ind.some((i) => i.severity === "critical")) {
    await recordSecurityEvent({ type: "suggestion.blocked_url", severity: "HIGH", outcome: "blocked", actorId: user.id, resourceType: "EventCandidate", metadata: { codes: ind.map((i) => i.code) } });
    return { ok: false, error: "validation.url" };
  }
  const issues = ind.filter((i) => i.severity !== "info").map((i) => `url-risk:${i.code}`);
  await ingestCandidate({ title: parsed.data.title, sourceUrl: parsed.data.url, description: parsed.data.note }, `suggest:${user.id}:${parsed.data.url}`, null, ["community-suggestion", ...issues]);
  return { ok: true, message: "suggest.sent" };
}
