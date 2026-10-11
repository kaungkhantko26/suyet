import type { Metadata } from "next";
import Link from "next/link";
import { AckButton, KillSwitch } from "@/components/admin/security-controls";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { daysAgo, formatDateTime } from "@/lib/dates";
import { isSwitchOn } from "@/lib/services/switches";
import type { RiskReport } from "@/lib/security/url-risk";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Security", robots: { index: false } };

const TONE = { INFO: "neutral", LOW: "neutral", MEDIUM: "warning", HIGH: "error", CRITICAL: "error" } as const;

export default async function AdminSecurity() {
  const me = await requirePermission("security.view", "/admin/security");
  const t = await getT();
  const day = daysAgo(1);
  const count = (type: string) => db.securityEvent.count({ where: { type, createdAt: { gte: day } } });
  const [paused, disabled, failedLogins, throttled, apiFail, replays, denied, alerts, events, pendingSubs, roleChanges, audit, orgs, queue, sources] = await Promise.all([
    isSwitchOn("automation_paused"), isSwitchOn("submissions_disabled"),
    count("auth.login_failed"), count("auth.login_rate_limited"), count("internal_api.auth_failed"), count("internal_api.replay_blocked"), count("authz.denied"),
    db.securityAlert.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.securityEvent.findMany({ where: { severity: { in: ["MEDIUM", "HIGH", "CRITICAL"] } }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.eventSubmission.findMany({ where: { status: "PENDING_REVIEW" }, include: { event: { select: { title: true, registrationUrl: true, sourceUrl: true } }, organizer: { select: { name: true, status: true } } }, orderBy: { submittedAt: "asc" }, take: 50 }),
    db.securityEvent.findMany({ where: { type: "role.changed" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { admin: { select: { name: true } } } }),
    db.organizer.findMany({ where: { deletedAt: null, status: { in: ["VERIFIED", "SUSPENDED"] } }, orderBy: { verifiedAt: "desc" }, take: 20 }),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.eventSource.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const risky = pendingSubs.map((s) => ({ s, r: s.riskReport as RiskReport | null })).filter((x) => x.r && x.r.indicators.some((i) => i.severity !== "info")).sort((a, b) => (b.r!.score - a.r!.score));
  const stat = [["Failed logins (24 h)", failedLogins], ["Throttled logins (24 h)", throttled], ["Webhook auth failures (24 h)", apiFail], ["Replays blocked (24 h)", replays], ["Access denied (24 h)", denied], ["Pending reviews", pendingSubs.length], ["Open alerts", alerts.length]] as const;
  const h = "mb-3 text-lg font-semibold";
  return (
    <div className="space-y-12">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.security")}</h1>

      <section aria-labelledby="ov"><h2 id="ov" className="sr-only">Overview</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stat.map(([l, n]) => <Card key={l} className="p-4"><dt className="text-sm text-muted">{l}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd></Card>)}</dl>
      </section>

      <section>
        <h2 className={h}>Emergency controls</h2>
        {can(me.role, "security.emergency") ? (
          <div className="flex flex-wrap gap-3"><KillSwitch k="submissions_disabled" on={disabled} label="Disable event submissions" /><KillSwitch k="automation_paused" on={paused} label="Pause automation (n8n + source checks)" /></div>
        ) : <p className="text-sm text-muted">Requires administrator access.</p>}
        <p className="mt-2 text-sm text-muted">Other emergency actions: unpublish an event (Events), suspend an organizer (Organizers), suspend a user and revoke sessions (Users), rotate <code>INTERNAL_API_SECRET</code> to disable a compromised API key. See INCIDENT_RESPONSE.md.</p>
      </section>

      <section>
        <h2 className={h}>Security alerts</h2>
        {alerts.length === 0 ? <p className="text-sm text-muted">No open alerts.</p> : (
          <ul className="space-y-2">{alerts.map((a) => <li key={a.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span><Badge tone={TONE[a.severity]}>{a.severity}</Badge> <strong className="ml-2">{a.kind}</strong> — {a.summary}<span className="ml-2 text-muted">{formatDateTime(a.createdAt, t.locale)}</span></span><AckButton id={a.id} /></Card></li>)}</ul>
        )}
      </section>

      <section>
        <h2 className={h}>Event risk reports (pending reviews)</h2>
        <p className="mb-3 text-sm text-muted">Indicators are advisory. Nothing here approves or verifies an event; a person decides in <Link href="/admin/submissions" className="underline">Submissions</Link>. There is intentionally no bulk-approve action.</p>
        {risky.length === 0 ? <p className="text-sm text-muted">No pending submissions with risk indicators.</p> : (
          <ul className="space-y-3">{risky.map(({ s, r }) => (
            <li key={s.id}><Card className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{s.event.title}</strong><span className="text-muted">{s.organizer.name} · {s.organizer.status === "VERIFIED" ? "verified organizer" : "unverified organizer"} · risk score {r!.score}</span></div>
              <ul className="list-disc space-y-0.5 pl-5">{r!.indicators.filter((i) => i.severity !== "info").map((i, k) => <li key={k}><Badge tone={TONE[i.severity.toUpperCase() as keyof typeof TONE]}>{i.severity}</Badge> <span className="ml-1">{i.code}</span> — {i.detail}{i.field && <span className="text-muted"> ({i.field})</span>}</li>)}</ul>
              {Object.entries(r!.webRisk).map(([f, w]) => <p key={f} className="text-xs text-muted">{f}: threat lookup {w.status}{w.status === "unchecked" ? ` (${w.reason})` : ""}</p>)}
              <Link href="/admin/submissions" className="inline-block underline underline-offset-4">Review · request information · reject · approve</Link>
            </Card></li>
          ))}</ul>
        )}
      </section>

      <section>
        <h2 className={h}>Suspicious activity (medium and above)</h2>
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface text-sm">
          {events.length === 0 && <li className="p-4 text-muted">Nothing to report.</li>}
          {events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span><Badge tone={TONE[e.severity]}>{e.severity}</Badge> <span className="ml-2 font-mono text-xs">{e.type}</span> · {e.outcome}{e.ipHash && <span className="ml-2 text-xs text-muted">ip#{e.ipHash.slice(0, 8)}</span>}</span><span className="text-xs text-muted">{formatDateTime(e.createdAt, t.locale)} {e.requestId && `· ${e.requestId.slice(0, 8)}`}</span></li>)}
        </ul>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section><h2 className={h}>Recent role changes</h2>
          <ul className="space-y-1.5 text-sm">{roleChanges.length === 0 && <li className="text-muted">None.</li>}{roleChanges.map((r) => <li key={r.id}>{formatDateTime(r.createdAt, t.locale)} · {JSON.stringify(r.metadata)}</li>)}</ul></section>
        <section><h2 className={h}>Organizer verification</h2>
          <ul className="space-y-1.5 text-sm">{orgs.length === 0 && <li className="text-muted">None verified yet.</li>}{orgs.map((o) => <li key={o.id}><Badge tone={o.status === "VERIFIED" ? "success" : "error"}>{o.status}</Badge> {o.name} <span className="text-muted">{o.verificationMethod?.toLowerCase().replaceAll("_", " ")}</span></li>)}</ul></section>
        <section><h2 className={h}>Automation health</h2>
          <p className="text-sm">n8n endpoint: <Badge tone={paused ? "warning" : "success"}>{paused ? "paused" : "active"}</Badge> · submissions: <Badge tone={disabled ? "warning" : "success"}>{disabled ? "disabled" : "open"}</Badge></p>
          <p className="mt-2 text-sm text-muted">Queue: {queue.map((q) => `${q.status} ${q._count._all}`).join(" · ") || "empty"}<br />Sources: {sources.map((q) => `${q.status} ${q._count._all}`).join(" · ") || "none"}</p></section>
        <section><h2 className={h}>API activity (24 h)</h2>
          <p className="text-sm text-muted">Auth failures {apiFail} · replays blocked {replays}. Accepted candidates appear under Automation.</p></section>
      </div>

      <section>
        <h2 className={h}>Audit log (append-only)</h2>
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface text-sm">
          {audit.map((l) => <li key={l.id} className="px-4 py-2.5"><div className="flex flex-wrap justify-between gap-2"><span><strong>{l.admin.name}</strong> · {l.action} · {l.targetType}{l.targetId && ` ${l.targetId.slice(0, 8)}`}</span><span className="text-xs text-muted">{formatDateTime(l.createdAt, t.locale)}</span></div></li>)}
        </ul>
      </section>
    </div>
  );
}
