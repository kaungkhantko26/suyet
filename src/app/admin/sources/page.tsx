import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { SourceForm } from "@/components/admin/forms";
import { sourceOpAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Sources", robots: { index: false } };

export default async function AdminSources() {
  await requirePermission("sources.manage", "/admin/sources");
  const t = await getT();
  const sources = await db.eventSource.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { events: true, candidates: true } } } });
  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.sources")}</h1>
      <Card className="p-5"><h2 className="mb-3 font-semibold">{t("common.create")}</h2><SourceForm /></Card>
      <ul className="space-y-3">
        {sources.map((s) => (
          <li key={s.id}><Card className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{s.name}</p><Badge tone={s.status === "ACTIVE" ? "success" : s.status === "PAUSED" ? "neutral" : "error"}>{s.status}</Badge></div>
            <p className="text-sm break-all text-muted">{s.url} · {s.type.replaceAll("_", " ").toLowerCase()}{s.organization && ` · ${s.organization}`}</p>
            <p className="text-xs text-muted">{s.lastCheckedAt ? formatDateTime(s.lastCheckedAt, t.locale) : "never checked"}{s.lastError && ` · ${s.lastError}`} · events {s._count.events} · candidates {s._count.candidates}</p>
            {s.reliabilityNotes && <p className="text-sm">{s.reliabilityNotes}</p>}
            <div className="flex gap-2">
              {s.status === "PAUSED" ? <ActionButton label="Resume" action={sourceOpAction} args={[s.id, "resume"]} /> : <ActionButton label="Pause" action={sourceOpAction} args={[s.id, "pause"]} />}
              <ActionButton variant="danger" label={t("common.delete")} confirm={`${t("common.delete")}?`} action={sourceOpAction} args={[s.id, "delete"]} />
            </div>
          </Card></li>
        ))}
      </ul>
    </div>
  );
}
