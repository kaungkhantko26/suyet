import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { CandidatePromote } from "@/components/admin/forms";
import { candidateRejectAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime, toDateTimeLocal } from "@/lib/dates";
import { formOptions } from "@/lib/form-options";
import { isSafeExternalUrl } from "@/lib/url";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Automation", robots: { index: false } };

export default async function AdminAutomation() {
  await requirePermission("review.candidates", "/admin/automation");
  const t = await getT();
  const [candidates, jobCounts, failed, orgs, opts] = await Promise.all([
    db.eventCandidate.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" }, take: 50, include: { duplicateOf: { select: { title: true, slug: true } } } }),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.job.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.organizer.findMany({ where: { deletedAt: null, status: { not: "SUSPENDED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    formOptions(t.locale),
  ]);
  const hasSecret = !!process.env.INTERNAL_API_SECRET;
  return (
    <div className="space-y-10">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.automation")}</h1>
      <Card className="space-y-2 p-5 text-sm">
        <p><strong>POST /api/internal/event-candidates</strong> — {hasSecret ? "INTERNAL_API_SECRET configured" : "INTERNAL_API_SECRET missing: endpoint disabled"}</p>
        <p className="text-muted">Queue: {jobCounts.map((j) => `${j.status} ${j._count._all}`).join(" · ") || "empty"}</p>
        {failed.length > 0 && <ul className="mt-2 list-disc pl-5 text-error">{failed.map((j) => <li key={j.id}>{j.type}: {j.lastError}</li>)}</ul>}
      </Card>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("admin.candidates")} ({candidates.length})</h2>
        {candidates.length === 0 ? <EmptyState title={t("admin.nothingPending")} /> : (
          <ul className="space-y-4">
            {candidates.map((c) => (
              <li key={c.id}><Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{c.title}</h3>
                  <div className="flex gap-1.5">{c.duplicateReasons.length > 0 && <Badge tone="warning">{t("admin.possibleDuplicate")}</Badge>}{c.validationIssues.length > 0 && <Badge tone="error">{c.validationIssues.length} issue(s)</Badge>}</div></div>
                <p className="text-sm text-muted">{c.organizerName ?? "—"} · {c.startAt ? formatDateTime(c.startAt, t.locale) : t("common.unknown")} · {formatDateTime(c.createdAt, t.locale)}</p>
                <p className="text-sm break-all">{isSafeExternalUrl(c.sourceUrl) ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">{c.sourceUrl}</a> : c.sourceUrl}</p>
                {c.missingFields.length > 0 && <p className="text-sm text-warning">{t("admin.missingFields", { fields: c.missingFields.join(", ") })}</p>}
                {c.validationIssues.length > 0 && <ul className="list-disc pl-5 text-sm text-error">{c.validationIssues.map((v) => <li key={v}>{v}</li>)}</ul>}
                {c.duplicateOf && <p className="text-sm">≈ <a className="underline underline-offset-4" href={`/events/${c.duplicateOf.slug}`}>{c.duplicateOf.title}</a> ({c.duplicateReasons.join(", ")})</p>}
                <details><summary className="min-h-9 cursor-pointer text-sm font-medium">{t("admin.promote")}</summary><div className="mt-3">
                  <CandidatePromote c={{ id: c.id, title: c.title, description: c.description ?? "", sourceUrl: c.sourceUrl, registrationUrl: c.registrationUrl ?? "", startAt: toDateTimeLocal(c.startAt), endAt: toDateTimeLocal(c.endAt), registrationDeadline: toDateTimeLocal(c.registrationDeadline), format: c.format ?? "", city: "" }} organizers={orgs.map((o) => ({ value: o.id, label: o.name }))} categories={opts.categories} locations={opts.locations} />
                </div></details>
                <div className="flex gap-2"><ActionButton label={t("admin.dismiss")} action={candidateRejectAction} args={[c.id, undefined, false]} /><ActionButton label={t("admin.possibleDuplicate")} action={candidateRejectAction} args={[c.id, undefined, true]} /></div>
              </Card></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
