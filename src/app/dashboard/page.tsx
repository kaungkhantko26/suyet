import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Trophy, UsersRound, Wrench } from "lucide-react";
import { EventGrid } from "@/components/events/event-grid";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getSavedIds } from "@/lib/events/lookups";
import { eventCardInclude, publicWhere } from "@/lib/events/queries";
import { categoryName } from "@/lib/events/view";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ organizerApplied?: string }> }) {
  const user = await requireUser("/dashboard");
  // /dashboard is the student workspace. Every other role lands in its own
  // purpose-built workspace, so a shared URL never exposes a shared dashboard.
  if (user.role === "ORGANIZER") redirect("/organizer/dashboard");
  if (["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/admin");
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const now = new Date();
  const upcoming = { OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] };
  const [interests, savedIds, saved, notifications] = await Promise.all([
    db.userInterest.findMany({ where: { userId: user.id }, include: { category: true } }),
    getSavedIds(user.id),
    db.savedEvent.findMany({ where: { userId: user.id, event: { ...publicWhere, registrationDeadline: { gt: now }, cancelled: false } }, include: { event: true }, orderBy: { event: { registrationDeadline: "asc" } }, take: 5 }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const interestIds = interests.map((i) => i.categoryId);
  const recommended = interestIds.length
    ? await db.event.findMany({
        where: { ...publicWhere, cancelled: false, ...upcoming, id: { notIn: [...savedIds] }, categories: { some: { categoryId: { in: interestIds } } } },
        include: eventCardInclude, orderBy: { startAt: "asc" }, take: 3,
      })
    : [];
  const h = "mb-4 text-lg font-semibold";
  return (
    <div className="space-y-12">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("dashboard.welcome", { name: user.name })}</h1>
      {sp.organizerApplied && <Alert tone="info">{t("auth.applicationPending")}</Alert>}

      <section aria-labelledby="student-actions">
        <h2 id="student-actions" className={h}>Explore and participate</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Hackathons", "Find competitions and team challenges.", "/hackathons", <Trophy key="i" />],
            ["Workshops", "Join workshops and build practical skills.", "/categories/technology-workshops", <Wrench key="i" />],
            ["Organizers", "Discover trusted communities and people behind events.", "/organizers", <UsersRound key="i" />],
            ["Registration history", "Track events you registered for and attended.", "/dashboard/registrations", <History key="i" />],
          ].map(([label, description, href, icon]) => (
            <Link key={String(href)} href={String(href)} className="group rounded-[16px] border border-border bg-surface p-4 transition-colors hover:border-fg/40 hover:bg-surface-2">
              <span className="mb-4 flex size-9 items-center justify-center rounded-[10px] bg-fg/6 text-fg [&>svg]:size-4" aria-hidden="true">{icon}</span>
              <span className="font-semibold">{label}</span><span className="mt-1 block text-sm text-muted">{description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className={h}>{t("dashboard.recommended")}</h2>
        {recommended.length ? <EventGrid events={recommended} t={t} savedIds={savedIds} authed /> : <EmptyState title={t("dashboard.emptyRecommended")} action={<ButtonLink href="/dashboard/preferences" variant="outline">{t("dashboard.editInterests")}</ButtonLink>} />}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className={h}>{t("dashboard.deadlines")}</h2>
          {saved.length ? (
            <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
              {saved.map(({ event: e }) => (
                <li key={e.id}><Link href={`/events/${e.slug}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"><span className="line-clamp-1 font-medium">{e.title}</span><span className="shrink-0 text-sm text-muted">{formatDate(e.registrationDeadline!, t.locale)}</span></Link></li>
              ))}
            </ul>
          ) : <EmptyState title={t("dashboard.emptyDeadlines")} />}
          <Link href="/dashboard/saved" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t("dashboard.saved")}</Link>
        </section>
        <section>
          <h2 className={h}>{t("dashboard.interests")}</h2>
          {interests.length ? <div className="flex flex-wrap gap-2">{interests.map((i) => <Badge key={i.categoryId} tone="info">{categoryName(i.category, t.locale)}</Badge>)}</div> : <p className="text-sm text-muted">{t("dashboard.emptyRecommended")}</p>}
          <ButtonLink href="/dashboard/preferences" variant="outline" size="sm" className="mt-4">{t("dashboard.editInterests")}</ButtonLink>
          <h2 className={`${h} mt-10`}>{t("dashboard.notifications")}</h2>
          {notifications.length ? (
            <ul className="space-y-2">{notifications.map((n) => <li key={n.id} className="rounded-[10px] border border-border bg-surface px-4 py-3 text-sm"><Link href={n.body.replace(/^https?:\/\/[^/]+/, "")} className={n.readAt ? "" : "font-semibold"}>{n.title}</Link></li>)}</ul>
          ) : <p className="text-sm text-muted">{t("dashboard.emptyNotifications")}</p>}
        </section>
      </div>
    </div>
  );
}
