import type { Metadata } from "next";
import Link from "next/link";
import { ReportActions } from "@/components/admin/report-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Reports", robots: { index: false } };

export default async function AdminReports() {
  await requirePermission("review.reports", "/admin/reports");
  const t = await getT();
  const reports = await db.eventReport.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { event: { select: { title: true, slug: true } }, reporter: { select: { email: true } } } });
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.reports")}</h1>
      {reports.length === 0 ? <EmptyState title={t("admin.nothingPending")} /> : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}><Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/events/${r.event.slug}`} className="font-semibold underline-offset-4 hover:underline">{r.event.title}</Link>
                <Badge tone={r.status === "OPEN" ? "warning" : r.status === "RESOLVED" ? "success" : "neutral"}>{t(`admin.ReportStatus.${r.status}`)}</Badge>
              </div>
              <p className="text-sm"><strong>{t(`report.${r.reason}`)}</strong> — {r.details}</p>
              <p className="text-xs text-muted">{formatDateTime(r.createdAt, t.locale)} · {r.reporter?.email ?? "anonymous"}</p>
              {r.resolutionNotes && <p className="text-sm text-muted">{r.resolutionNotes}</p>}
              <ReportActions id={r.id} />
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}
