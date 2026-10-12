import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BarList, StatusBar } from "@/components/charts/bar-list";
import { RegistrationTabs } from "@/components/layout/registration-tabs";
import { RegistrationDecision } from "@/components/forms/registration-decision";
import { canManageOrganizer, requireOrganizer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { Answer } from "@/lib/registration/schema";
import { fieldBreakdowns, registrationsByDay } from "@/lib/registration/analysis";
import { listRegistrations, loadForm, formToInput, registrationCounts } from "@/lib/services/registrations";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Registration responses", robots: { index: false } };

export default async function RegistrationResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOrganizer(`/organizer/events/${id}/registration/responses`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!event || !(await canManageOrganizer(user, event.organizerId))) notFound();
  const t = await getT();
  const form = await loadForm(id);
  const input = formToInput(form);
  const { rows } = await listRegistrations(user, id);
  const counts = await registrationCounts(id);
  const total = counts.pending + counts.approved + counts.rejected + counts.withdrawn;
  const order = { SUBMITTED: 0, APPROVED: 1, REJECTED: 2, WITHDRAWN: 3 } as const;
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
  const tone = { SUBMITTED: "warning", APPROVED: "success", REJECTED: "error", WITHDRAWN: "outline" } as const;

  const byDay = registrationsByDay(rows);
  const breakdowns = fieldBreakdowns(input.fields.filter((f): f is typeof f & { id: string } => !!f.id), rows);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">{event.title}</p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">{t("registration.tabResponses")}</h1>
      </header>

      <RegistrationTabs eventId={id} active="responses" formLabel={t("registration.tabForm")} responsesLabel={t("registration.tabResponses")} responseCount={total} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["pending", counts.pending], ["approved", counts.approved], ["rejected", counts.rejected], ["withdrawn", counts.withdrawn]] as const).map(([k, n]) => (
          <div key={k} className="rounded-[12px] border border-border bg-surface p-3"><dt className="text-xs text-muted">{t(`registration.status.${k}`)}</dt><dd className="font-serif text-2xl tabular-nums">{n}</dd></div>
        ))}
      </dl>

      {total === 0 ? (
        <p className="text-sm text-muted">{t("registration.analysisNoData")}</p>
      ) : (
        <section aria-labelledby="analysis" className="space-y-5">
          <h2 id="analysis" className="text-xl font-semibold">{t("registration.analysisTitle")}</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted">{t("registration.analysisStatus")}</h3>
              <StatusBar
                segments={[
                  { label: t("registration.status.pending"), value: counts.pending, className: "bg-warning" },
                  { label: t("registration.status.approved"), value: counts.approved, className: "bg-success" },
                  { label: t("registration.status.rejected"), value: counts.rejected, className: "bg-error" },
                  { label: t("registration.status.withdrawn"), value: counts.withdrawn, className: "bg-fg/25" },
                ]}
              />
            </Card>
            {byDay.length > 0 && (
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-muted">{t("registration.analysisByDay")}</h3>
                <BarList items={byDay.map((d) => ({ label: formatDate(new Date(`${d.date}T00:00:00Z`), t.locale), value: d.count }))} />
              </Card>
            )}
            {breakdowns.map((b) => (
              <Card key={b.fieldId} className="p-5">
                <h3 className="mb-4 truncate text-sm font-semibold text-muted" title={b.label}>{b.label}</h3>
                <BarList items={b.options.map((o) => ({ label: o.option, value: o.count }))} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="resp">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="resp" className="text-xl font-semibold">{t("registration.responses")}</h2>
          {rows.length > 0 && <ButtonLink href={`/organizer/events/${id}/registrations.csv`} variant="outline" prefetch={false}><Download className="size-4" aria-hidden="true" />{t("registration.exportCsv")}</ButtonLink>}
        </div>
        <p className="mb-4 text-sm text-muted">{t("registration.privacyNote")}</p>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("registration.noResponses")}</p> : (
          <ul className="space-y-3">
            {sorted.map((r) => (
              <li key={r.id} className="rounded-[14px] border border-border bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.user.name} <span className="font-normal text-muted">· {r.user.email}</span></p>
                  <span className="flex items-center gap-2 text-xs text-muted">{formatDateTime(r.createdAt, t.locale)}<Badge tone={tone[r.status]}>{t(`registration.statusLabel.${r.status}`)}</Badge></span>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {(r.answers as unknown as Answer[]).map((a) => (
                    <div key={a.fieldId}><dt className="text-xs text-muted">{a.label}</dt><dd className="break-words whitespace-pre-line">{Array.isArray(a.value) ? a.value.join(", ") : typeof a.value === "boolean" ? t("common.yes") : String(a.value)}</dd></div>
                  ))}
                </dl>
                {r.status !== "WITHDRAWN" && <RegistrationDecision id={r.id} status={r.status} note={r.decisionNote} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
