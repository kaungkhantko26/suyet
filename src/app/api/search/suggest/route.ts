import { apiError, apiJson, requestIdFrom } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicWhere } from "@/lib/events/queries";
import { isLocale } from "@/i18n/core";

export const dynamic = "force-dynamic";

export interface Suggestion {
  kind: "category" | "location" | "event";
  label: string;
  href: string;
}

/**
 * Lightweight search-as-you-type suggestions: matching categories/locations (by name) and up to a few matching
 * published event titles. Read-only, no personal data, rate-limited like public search.
 */
export async function GET(req: Request) {
  const rid = requestIdFrom(req);
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const locale = isLocale(searchParams.get("locale")) ? searchParams.get("locale")! : "en";
  if (q.length < 2) return apiJson({ suggestions: [] satisfies Suggestion[] }, 200, rid);

  const rl = await rateLimit(`search-suggest:${clientIp(req.headers)}`, 60, 60);
  if (!rl.allowed) return apiError(429, "rate_limited", "Too many requests", rid, {}, { "Retry-After": String(rl.retryAfterSec) });

  const nameField = locale === "my" ? "nameMy" : "nameEn";

  const [categories, locations, events] = await Promise.all([
    db.eventCategory.findMany({ where: { isActive: true, OR: [{ nameEn: { contains: q, mode: "insensitive" } }, { nameMy: { contains: q, mode: "insensitive" } }] }, select: { slug: true, nameEn: true, nameMy: true }, take: 4 }),
    db.location.findMany({ where: { isActive: true, OR: [{ nameEn: { contains: q, mode: "insensitive" } }, { nameMy: { contains: q, mode: "insensitive" } }] }, select: { slug: true, nameEn: true, nameMy: true }, take: 3 }),
    db.event.findMany({ where: { ...publicWhere, cancelled: false, title: { contains: q, mode: "insensitive" } }, select: { slug: true, title: true }, orderBy: { startAt: "asc" }, take: 5 }),
  ]);

  const suggestions: Suggestion[] = [
    ...categories.map((c) => ({ kind: "category" as const, label: (locale === "my" ? c.nameMy : c.nameEn) || c[nameField], href: `/categories/${c.slug}` })),
    ...locations.map((l) => ({ kind: "location" as const, label: (locale === "my" ? l.nameMy : l.nameEn) || l[nameField], href: `/locations/${l.slug}` })),
    ...events.map((e) => ({ kind: "event" as const, label: e.title, href: `/events/${e.slug}` })),
  ].slice(0, 8);

  return apiJson({ suggestions }, 200, rid);
}
