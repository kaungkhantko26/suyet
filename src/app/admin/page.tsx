import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminOverview() {
  const user = await requirePermission("admin.access", "/admin");
  const t = await getT();
  if (user.role === "MODERATOR") {
    const [pending, reports, candidates, verification] = await Promise.all([
      db.eventSubmission.count({ where: { status: "PENDING_REVIEW" } }),
      db.eventReport.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
      db.eventCandidate.count({ where: { status: "PENDING_REVIEW" } }),
      db.event.count({ where: { deletedAt: null, verificationStatus: { in: ["PENDING_VERIFICATION", "NEEDS_REVIEW"] } } }),
    ]);
    const reviewCards: [string, number, string][] = [
      [t("admin.pendingSubmissions"), pending, "/admin/submissions"],
      [t("admin.openReports"), reports, "/admin/reports"],
      [t("admin.candidates"), candidates, "/admin/automation"],
      ["Events awaiting verification", verification, "/admin/events"],
    ];
    return (
      <div className="space-y-10">
        <div><p className="eyebrow mb-2">Moderator workspace</p><h1 className="font-serif text-3xl font-medium tracking-tight">Review queue</h1><p className="mt-2 text-muted">Review submissions, reports, candidates, and verification evidence. Publishing and account management remain administrator-only.</p></div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {reviewCards.map(([label, n, href]) => (<Link key={href} href={href}><Card className="h-full p-4 transition-colors hover:border-fg/40"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd></Card></Link>))}
        </dl>
      </div>
    );
  }
  const now = new Date();
  const live = { deletedAt: null };
  const [total, upcoming, published, pending, users, verifiedOrgs, reports, candidates, recent, privileged] = await Promise.all([
    db.event.count({ where: live }),
    db.event.count({ where: { ...live, publishState: "PUBLISHED", startAt: { gt: now } } }),
    db.event.count({ where: { ...live, publishState: "PUBLISHED" } }),
    db.eventSubmission.count({ where: { status: "PENDING_REVIEW" } }),
    db.user.count({ where: { deletedAt: null } }),
    db.organizer.count({ where: { status: "VERIFIED", deletedAt: null } }),
    db.eventReport.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    db.eventCandidate.count({ where: { status: "PENDING_REVIEW" } }),
    db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { admin: { select: { name: true } } } }),
    user.role === "SUPER_ADMIN" ? db.user.count({ where: { deletedAt: null, role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } } }) : Promise.resolve(0),
  ]);
  const cards: [string, number, string][] = [
    [t("admin.totalEvents"), total, "/admin/events"], [t("admin.upcomingEvents"), upcoming, "/admin/events"], [t("admin.publishedEvents"), published, "/admin/events"],
    [t("admin.pendingSubmissions"), pending, "/admin/submissions"], [t("admin.candidates"), candidates, "/admin/automation"], [t("admin.registeredUsers"), users, "/admin/users"],
    [t("admin.verifiedOrganizers"), verifiedOrgs, "/admin/organizers"], [t("admin.openReports"), reports, "/admin/reports"],
  ];
  if (user.role === "SUPER_ADMIN") cards.push(["Privileged accounts", privileged, "/admin/users"]);
  return (
    <div className="space-y-10">
      <div><p className="eyebrow mb-2">{user.role === "SUPER_ADMIN" ? "Super admin workspace" : "Administrator workspace"}</p><h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.overview")}</h1></div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, n, href]) => (<Link key={label} href={href}><Card className="h-full p-4 transition-colors hover:border-fg/40"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd></Card></Link>))}
      </dl>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("admin.audit")}</h2>
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface text-sm">
          {recent.length === 0 && <li className="p-4 text-muted">{t("analytics.noData")}</li>}
          {recent.map((l) => <li key={l.id} className="flex flex-wrap justify-between gap-2 px-4 py-3"><span><strong>{l.admin.name}</strong> · {l.action} · {l.targetType}</span><span className="text-muted">{formatDateTime(l.createdAt, t.locale)}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
