import type { Metadata } from "next";
import Link from "next/link";
import { ReviewForm } from "@/components/admin/review-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { isSafeExternalUrl } from "@/lib/url";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Submissions", robots: { index: false } };

export default async function AdminSubmissions() {
  await requirePermission("review.submissions", "/admin/submissions");
  const t = await getT();
  const subs = await db.eventSubmission.findMany({
    where: { status: "PENDING_REVIEW" }, orderBy: { submittedAt: "asc" },
    include: { event: true, organizer: true, submittedBy: { select: { name: true, email: true } } },
  });
  const link = (u: string | null) => u && isSafeExternalUrl(u) ? <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-4">{u}</a> : <span className="text-muted">{t("common.unknown")}</span>;
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.submissions")}</h1>
      {subs.length === 0 ? <EmptyState title={t("admin.nothingPending")} /> : (
        <ul className="space-y-4">
          {subs.map((s) => {
            const changes = s.changes as { fields: string[]; values: Record<string, unknown> } | null;
            return (
              <li key={s.id}>
                <Card className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold">{s.event.title}</h2>
                    <Badge tone={s.isUpdate ? "info" : "warning"}>{s.isUpdate ? t("common.update") : t("admin.submissions")}</Badge>
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted">{t("events.organizer")}</dt><dd>{s.organizer.name} ({t(`organizers.types.${s.organizer.type}`)}, {t(`verification.${s.organizer.status === "VERIFIED" ? "VERIFIED" : "UNVERIFIED"}`)})</dd></div>
                    <div><dt className="text-muted">{t("admin.submitted")}</dt><dd>{formatDateTime(s.submittedAt, t.locale)} · {s.submittedBy.name}</dd></div>
                    <div><dt className="text-muted">{t("admin.sourceUrlLabel")}</dt><dd>{link(s.event.sourceUrl)}</dd></div>
                    <div><dt className="text-muted">{t("details.registerCta")}</dt><dd>{link(s.event.registrationUrl)}</dd></div>
                    <div><dt className="text-muted">{t("details.date")}</dt><dd>{formatDateTime(s.event.startAt, t.locale)}</dd></div>
                    <div><dt className="text-muted">{t("details.deadline")}</dt><dd>{s.event.registrationDeadline ? formatDateTime(s.event.registrationDeadline, t.locale) : t("common.unknown")}</dd></div>
                  </dl>
                  {changes && (
                    <div className="rounded-[10px] bg-surface-2 p-3 text-sm"><p className="mb-1 font-medium">{changes.fields.join(", ")}</p><pre className="overflow-x-auto text-xs">{JSON.stringify(changes.values, null, 2)}</pre></div>
                  )}
                  <p className="text-sm"><Link href={`/organizer/events/${s.eventId}/edit`} className="underline underline-offset-4">{t("common.edit")}</Link> · {formatDate(s.event.startAt, t.locale)}</p>
                  <ReviewForm submissionId={s.id} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
