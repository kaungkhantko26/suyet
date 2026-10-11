import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/dates";
import { publicWhere } from "@/lib/events/queries";
import { categoryName } from "@/lib/events/view";
import { getCategories, getLocations } from "@/lib/events/lookups";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Analytics", robots: { index: false } };

function Bars({ rows, empty }: { rows: { label: string; n: number; href?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</span><span className="tabular-nums">{r.n}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-fg/8" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminAnalytics() {
  await requirePermission("analytics.view", "/admin/analytics");
  const t = await getT();
  const since = daysAgo(30);
  const [cats, locs] = await Promise.all([getCategories(), getLocations()]);
  const [views, clicks, saves, searches, topViewed, topSearch, byCat, byLoc, subs, orgActivity, upcoming] = await Promise.all([
    db.analyticsEvent.count({ where: { type: "PAGE_VIEW", createdAt: { gte: since } } }),
    db.analyticsEvent.count({ where: { type: "REGISTRATION_CLICK", createdAt: { gte: since } } }),
    db.analyticsEvent.count({ where: { type: "SAVE", createdAt: { gte: since } } }),
    db.analyticsEvent.count({ where: { type: "SEARCH", createdAt: { gte: since } } }),
    db.analyticsEvent.groupBy({ by: ["eventId"], where: { type: "PAGE_VIEW", eventId: { not: null }, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { eventId: "desc" } }, take: 8 }),
    db.analyticsEvent.groupBy({ by: ["query"], where: { type: "SEARCH", query: { not: null }, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { query: "desc" } }, take: 8 }),
    db.eventCategoryRelation.groupBy({ by: ["categoryId"], where: { event: publicWhere }, _count: { _all: true } }),
    db.event.groupBy({ by: ["locationId"], where: publicWhere, _count: { _all: true } }),
    db.eventSubmission.count({ where: { submittedAt: { gte: since } } }),
    db.event.groupBy({ by: ["organizerId"], where: { createdAt: { gte: since }, deletedAt: null }, _count: { _all: true }, orderBy: { _count: { organizerId: "desc" } }, take: 8 }),
    db.event.count({ where: { ...publicWhere, startAt: { gt: new Date() } } }),
  ]);
  const evTitles = await db.event.findMany({ where: { id: { in: topViewed.map((v) => v.eventId!) } }, select: { id: true, title: true, slug: true } });
  const orgNames = await db.organizer.findMany({ where: { id: { in: orgActivity.map((o) => o.organizerId) } }, select: { id: true, name: true } });
  const stat = [[t("analytics.pageViews"), views], [t("analytics.clicks"), clicks], [t("analytics.saves"), saves], [t("analytics.searches"), searches], [t("admin.upcomingEvents"), upcoming], [t("analytics.submissionVolume"), subs]] as const;
  const h = "mb-3 text-base font-semibold";
  return (
    <div className="space-y-10">
      <div><h1 className="font-serif text-3xl font-medium tracking-tight">{t("analytics.title")}</h1><p className="mt-1 text-sm text-muted">{t("analytics.note")} (30d)</p></div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">{stat.map(([l, n]) => <Card key={l} className="p-4"><dt className="text-sm text-muted">{l}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd></Card>)}</dl>
      <div className="grid gap-8 lg:grid-cols-2">
        <section><h2 className={h}>{t("analytics.topEvents")}</h2><Bars empty={t("analytics.noData")} rows={topViewed.map((v) => { const e = evTitles.find((x) => x.id === v.eventId); return { label: e?.title ?? "—", n: v._count._all, href: e ? `/events/${e.slug}` : undefined }; })} /></section>
        <section><h2 className={h}>{t("analytics.topSearches")}</h2><Bars empty={t("analytics.noData")} rows={topSearch.map((s) => ({ label: s.query!, n: s._count._all }))} /></section>
        <section><h2 className={h}>{t("analytics.byCategory")}</h2><Bars empty={t("analytics.noData")} rows={byCat.map((c) => ({ label: categoryName(cats.find((x) => x.id === c.categoryId) ?? { nameEn: "?", nameMy: "?" }, t.locale), n: c._count._all })).sort((a, b) => b.n - a.n)} /></section>
        <section><h2 className={h}>{t("analytics.byLocation")}</h2><Bars empty={t("analytics.noData")} rows={byLoc.map((l) => { const x = locs.find((y) => y.id === l.locationId); return { label: x ? (t.locale === "my" ? x.nameMy : x.nameEn) : t("common.unknown"), n: l._count._all }; }).sort((a, b) => b.n - a.n)} /></section>
        <section><h2 className={h}>{t("analytics.organizerActivity")}</h2><Bars empty={t("analytics.noData")} rows={orgActivity.map((o) => ({ label: orgNames.find((x) => x.id === o.organizerId)?.name ?? "—", n: o._count._all }))} /></section>
      </div>
    </div>
  );
}
