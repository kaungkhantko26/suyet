import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { VerifyForm } from "@/components/admin/forms";
import { eventOpAction } from "@/app/actions/admin";
import { PublishBadge } from "@/components/organizer/badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/events/status-badge";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { computeEventStatus } from "@/lib/event-status";
import { effectiveRegistrationUrl } from "@/lib/events/registration-helpers";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Events", robots: { index: false } };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<{ state?: string; q?: string }> }) {
  const me = await requirePermission("review.verify", "/admin/events");
  const manage = can(me.role, "events.manage");
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const state = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(sp.state ?? "") ? (sp.state as "DRAFT" | "PUBLISHED" | "ARCHIVED") : undefined;
  const events = await db.event.findMany({
    where: { deletedAt: null, ...(state ? { publishState: state } : {}), ...(sp.q ? { title: { contains: sp.q.slice(0, 100), mode: "insensitive" } } : {}) },
    include: { organizer: { select: { name: true } }, registrationForm: { select: { enabled: true } } }, orderBy: { updatedAt: "desc" }, take: 100,
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.events")}</h1>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q} placeholder={t("common.search")} aria-label={t("common.search")} className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-sm" />
        <select name="state" defaultValue={state ?? ""} aria-label={t("common.status")} className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-sm"><option value="">{t("common.all")}</option>{["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => <option key={s} value={s}>{t(`organizerArea.pub.${s}`)}</option>)}</select>
        <button className="min-h-11 cursor-pointer rounded-[10px] border border-border bg-surface px-4 text-sm font-medium">{t("common.apply")}</button>
      </form>
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {e.publishState === "PUBLISHED" ? <Link href={`/events/${e.slug}`} className="font-semibold underline-offset-4 hover:underline">{e.title}</Link> : <span className="font-semibold">{e.title}</span>}
                  <p className="mt-1 text-sm text-muted">{e.organizer.name} · {formatDate(e.startAt, t.locale)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5"><PublishBadge state={e.publishState} t={t} /><StatusBadge status={computeEventStatus({ ...e, registrationUrl: effectiveRegistrationUrl(e) })} t={t} /><Badge tone={e.verificationStatus === "VERIFIED" ? "success" : e.verificationStatus === "NEEDS_REVIEW" ? "warning" : "neutral"}>{t(`verification.${e.verificationStatus}`)}</Badge>{e.featured && <Badge tone="info">{t("admin.feature")}</Badge>}</div>
              </div>
              {manage && (
              <div className="mt-4 flex flex-wrap gap-2">
                {e.publishState !== "PUBLISHED" && <ActionButton variant="primary" label={t("admin.publish")} action={eventOpAction} args={[e.id, "publish"]} />}
                {e.publishState === "PUBLISHED" && <ActionButton label={t("admin.unpublish")} action={eventOpAction} args={[e.id, "unpublish"]} />}
                {e.publishState === "PUBLISHED" && <ActionButton label={e.featured ? t("admin.unfeature") : t("admin.feature")} action={eventOpAction} args={[e.id, e.featured ? "unfeature" : "feature"]} />}
                {e.publishState !== "ARCHIVED" && <ActionButton label={t("admin.archive")} action={eventOpAction} args={[e.id, "archive"]} />}
                <ActionButton variant="danger" label={t("common.delete")} confirm={t("admin.confirmDelete")} action={eventOpAction} args={[e.id, "delete"]} />
              </div>
              )}
              <details className="mt-4 border-t border-border pt-3">
                <summary className="min-h-9 cursor-pointer text-sm font-medium">{t("admin.verify")} · {e.lastVerifiedAt ? formatDate(e.lastVerifiedAt, t.locale) : t("verification.never")}</summary>
                <div className="mt-3"><VerifyForm eventId={e.id} status={e.verificationStatus} sourceUrl={e.sourceUrl ?? ""} /></div>
              </details>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
