import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { RegistrationApplyForm, type ApplyField } from "@/components/forms/registration-apply-form";
import { WithdrawButton } from "@/components/forms/withdraw-button";
import { BadgeCheck } from "lucide-react";
import { Alert, Container } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { computeEventStatus } from "@/lib/event-status";
import { effectiveRegistrationUrl } from "@/lib/events/registration-helpers";
import { getEventBySlug } from "@/lib/events/queries";
import { activeCount, loadForm } from "@/lib/services/registrations";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Register", robots: { index: false } };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/apply`); // registration needs an account (spam control, one per person)
  const [t, e] = await Promise.all([getT(), getEventBySlug(slug)]);
  if (!e || e.registrationMode !== "ON_PLATFORM") notFound();
  const form = await loadForm(e.id);
  if (!form?.enabled) notFound();
  const [mine, taken] = await Promise.all([db.registration.findUnique({ where: { eventId_userId: { eventId: e.id, userId: user.id } } }), activeCount(e.id)]);
  const now = new Date();
  const open = computeEventStatus({ ...e, registrationUrl: effectiveRegistrationUrl({ ...e, registrationForm: form }) }) === "REGISTRATION_OPEN" && (!form.closesAt || now < form.closesAt);
  const full = form.capacity !== null && taken >= form.capacity;
  const fields: ApplyField[] = form.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, helpText: f.helpText, required: f.required, options: (f.options as string[] | null) ?? [], maxLength: (f.rules as { maxLength?: number } | null)?.maxLength }));
  const status = mine?.status;
  const holds = status === "SUBMITTED" || status === "APPROVED";

  return (
    <Container className="max-w-2xl py-12">
      <Link href={`/events/${e.slug}`} className="text-sm text-muted underline-offset-4 hover:underline">← {e.title}</Link>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">{t("registration.applyTitle", { title: e.title })}</h1>
      <p className="mt-2 text-sm text-muted">{formatDateTime(e.startAt, t.locale)} · {t("common.mmt")}{form.capacity !== null && <> · {full ? t("registration.full") : t("registration.spotsLeft", { left: form.capacity - taken })}</>}</p>
      {form.description && <p className="mt-5 whitespace-pre-line">{form.description}</p>}
      {form.requireApproval && <p className="mt-4 text-sm text-muted">{t("registration.reviewNotice")}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-surface p-4 text-sm">
          <p className="eyebrow">{t("registration.organizedBy")}</p>
          <p className="mt-1 flex items-center gap-1.5 font-semibold">{e.organizer.name}{e.organizer.status === "VERIFIED" && <BadgeCheck className="size-4 text-primary" aria-label={t("verification.organizerVerified")} />}</p>
          <p className="mt-0.5 text-muted">{e.organizer.status === "VERIFIED" ? t("verification.organizerVerified") : t("verification.organizerUnverified")}</p>
          <Link href={`/organizers/${e.organizer.slug}`} className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4">{t("details.organizerProfile")}</Link>
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-4 text-sm">
          <p className="eyebrow">{t("registration.registeringAs")}</p>
          <p className="mt-1 font-semibold">{user.name}</p>
          <p className="text-muted">{user.email}</p>
          <Link href="/dashboard/profile" className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4">{t("registration.editProfile")}</Link>
        </div>
      </div>
      <div className="mt-8">
        {status === "REJECTED" ? (
          <div className="space-y-3">
            <Alert tone="error">{t("registration.rejectedFinal")}</Alert>
            {mine?.decisionNote && <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-sm"><span className="font-medium">{e.organizer.name}:</span> {mine.decisionNote}</p>}
          </div>
        ) : holds ? (
          <div className="space-y-4">
            <Alert tone={status === "APPROVED" ? "success" : "info"}>
              <span className="flex items-center gap-2"><CheckCircle2 className="size-4" aria-hidden="true" />{status === "APPROVED" ? t("registration.approvedHint") : t("registration.pendingHint")}</span>
            </Alert>
            {mine?.decisionNote && <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-sm"><span className="font-medium">{e.organizer.name}:</span> {mine.decisionNote}</p>}
            {status === "APPROVED" && form.confirmationMessage && <p className="whitespace-pre-line text-muted">{form.confirmationMessage}</p>}
            <WithdrawButton eventId={e.id} />
          </div>
        ) : !open ? <Alert tone="warning">{t("registration.closed")}</Alert>
          : full ? <Alert tone="warning">{t("registration.full")}</Alert>
          : <RegistrationApplyForm slug={e.slug} fields={fields} consent={t("registration.consent", { organizer: e.organizer.name })} />}
      </div>
    </Container>
  );
}
