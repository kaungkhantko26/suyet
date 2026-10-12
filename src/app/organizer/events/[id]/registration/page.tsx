import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationBuilder } from "@/components/forms/registration-builder";
import { Alert } from "@/components/ui/misc";
import { RegistrationTabs } from "@/components/layout/registration-tabs";
import { canManageOrganizer, requireOrganizer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { loadForm, formToInput, registrationCounts } from "@/lib/services/registrations";
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
  const counts = await registrationCounts(id);
  const total = counts.pending + counts.approved + counts.rejected + counts.withdrawn;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">{event.title}</p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">{t("registration.builderTitle")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("registration.builderIntro")}</p>
      </header>

      <RegistrationTabs eventId={id} active="form" formLabel={t("registration.tabForm")} responsesLabel={t("registration.tabResponses")} responseCount={total} />

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
    </div>
  );
}
