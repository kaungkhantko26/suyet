import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Settings", robots: { index: false } };

export default async function AdminSettings() {
  await requirePermission("settings.view", "/admin/settings");
  const t = await getT();
  const messages = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const logs = await db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { admin: { select: { name: true } } } });
  const env: [string, boolean][] = [
    ["APP_URL", !!process.env.APP_URL], ["SMTP_HOST (email delivery)", !!process.env.SMTP_HOST],
    ["INTERNAL_API_SECRET (n8n)", !!process.env.INTERNAL_API_SECRET], ["CRON_SECRET", !!process.env.CRON_SECRET], ["S3 storage", process.env.STORAGE_DRIVER === "s3"],
  ];
  return (
    <div className="space-y-10">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.settings")}</h1>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Configuration</h2>
        <p className="mb-3 text-sm text-muted">Values are set through environment variables (secrets are never shown).</p>
        <ul className="divide-y divide-border text-sm">{env.map(([k, ok]) => <li key={k} className="flex items-center justify-between py-2.5"><span>{k}</span><Badge tone={ok ? "success" : "warning"}>{ok ? "configured" : "not set"}</Badge></li>)}</ul>
      </Card>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("footer.contact")}</h2>
        {messages.length === 0 ? <p className="text-sm text-muted">{t("analytics.noData")}</p> : (
          <ul className="space-y-3">{messages.map((m) => <li key={m.id}><Card className="p-4 text-sm"><p className="font-medium">{m.name} · {m.email}</p><p className="mt-1 whitespace-pre-line">{m.message}</p><p className="mt-2 text-xs text-muted">{formatDateTime(m.createdAt, t.locale)}</p></Card></li>)}</ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("admin.audit")}</h2>
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface text-sm">
          {logs.map((l) => <li key={l.id} className="px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><span><strong>{l.admin.name}</strong> · {l.action} · {l.targetType}{l.targetId && ` ${l.targetId.slice(0, 8)}`}</span><span className="text-muted">{formatDateTime(l.createdAt, t.locale)}</span></div>{l.details != null && <pre className="mt-1 overflow-x-auto text-xs text-muted">{JSON.stringify(l.details)}</pre>}</li>)}
        </ul>
      </section>
    </div>
  );
}
