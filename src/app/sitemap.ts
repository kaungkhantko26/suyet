import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, cats, locs, orgs] = await Promise.all([
    db.event.findMany({ where: { publishState: "PUBLISHED", deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.eventCategory.findMany({ where: { isActive: true }, select: { slug: true } }),
    db.location.findMany({ where: { isActive: true }, select: { slug: true } }),
    db.organizer.findMany({ where: { deletedAt: null, status: { not: "SUSPENDED" }, events: { some: { publishState: "PUBLISHED" } } }, select: { slug: true, updatedAt: true } }),
  ]);
  const u = (p: string) => `${config.appUrl}${p}`;
  return [
    ...["", "/events", "/hackathons", "/calendar", "/organizers", "/submit-event", "/about", "/contact", "/privacy", "/terms"].map((p) => ({ url: u(p || "/") })),
    ...cats.map((c) => ({ url: u(`/categories/${c.slug}`) })),
    ...locs.map((l) => ({ url: u(`/locations/${l.slug}`) })),
    ...orgs.map((o) => ({ url: u(`/organizers/${o.slug}`), lastModified: o.updatedAt })),
    ...events.map((e) => ({ url: u(`/events/${e.slug}`), lastModified: e.updatedAt })),
  ];
}
