import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { RegistrationBuilder } from "@/components/forms/registration-builder";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { canManageOrganizer, requireOrganizer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import type { Answer } from "@/lib/registration/schema";
import { listRegistrations, loadForm, formToInput, registrationCounts } from "@/lib/services/registrations";
import { RegistrationDecision } from "@/components/forms/registration-decision";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Registration form", robots: { index: false } };

export default async function RegistrationAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOrganizer(`/organizer/events/${id}/registration`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!event || !(await canManageOrganizer(user, event.organizerId))) notFound(); // other organizers' events look nonexistent
  const t = await getT();
  const form = await loadForm(id);
  const input = formToInput(form);
  const { rows } = await listRegistrations(user, id);
  const counts = await registrationCounts(id);
  const order = { SUBMITTED: 0, APPROVED: 1, REJECTED: 2, WITHDRAWN: 3 } as const;
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
  const tone = { SUBMITTED: "warning", APPROVED: "success", REJECTED: "error", WITHDRAWN: "outline" } as const;

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">{event.title}</p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">{t("registration.builderTitle")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("registration.builderIntro")}</p>
      </header>

      {event.registrationMode !== "ON_PLATFORM" ? (
        <Alert tone="warning">{t("registration.notOnPlatform")} <Link href={`/organizer/events/${id}/edit`} className="underline">{t("common.edit")}</Link></Alert>
      ) : (
        <RegistrationBuilder
          eventId={id}
          initial={{
            enabled: input.enabled, requireApproval: input.requireApproval, description: input.description, confirmationMessage: input.confirmationMessage, capacity: input.capacity?.toString() ?? "", closesAt: input.closesAt,
            fields: input.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, helpText: f.helpText, required: f.required, optionsText: (f.options ?? []).join("\n"), maxLength: f.rules?.maxLength?.toString() ?? "" })),
          }}
        />
      )}

      <section aria-labelledby="resp">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="resp" className="text-xl font-semibold">{t("registration.responses")}</h2>
          {rows.length > 0 && <ButtonLink href={`/organizer/events/${id}/registrations.csv`} variant="outline" prefetch={false}><Download className="size-4" aria-hidden="true" />{t("registration.exportCsv")}</ButtonLink>}
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["pending", counts.pending], ["approved", counts.approved], ["rejected", counts.rejected], ["withdrawn", counts.withdrawn]] as const).map(([k, n]) => (
            <div key={k} className="rounded-[12px] border border-border bg-surface p-3"><dt className="text-xs text-muted">{t(`registration.status.${k}`)}</dt><dd className="font-serif text-2xl tabular-nums">{n}</dd></div>
          ))}
        </dl>
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
