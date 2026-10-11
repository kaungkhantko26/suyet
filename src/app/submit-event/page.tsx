import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SuggestForm } from "@/components/forms/suggest-form";
import { OrganizerApplyForm } from "@/components/forms/organizer-apply-form";
import { Alert, Container } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Submit an event", alternates: { canonical: "/submit-event" } };

export default async function SubmitEventPage() {
  const [t, user] = await Promise.all([getT(), getCurrentUser()]);
  const pending = user ? await db.organizerApplication.findFirst({ where: { userId: user.id, status: "PENDING" } }) : null;
  const isOrganizer = !!user && can(user.role, "event.submit");
  return (
    <Container className="max-w-3xl py-14">
      <h1 className="font-serif text-4xl font-medium tracking-tight">{t("submit.title")}</h1>
      <p className="mt-3 text-lg text-muted">{t("submit.description")}</p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {(["how1", "how2", "how3"] as const).map((k, i) => (<li key={k} className="rounded-[12px] border border-border bg-surface p-4 text-sm"><span className="eyebrow tabular-nums">0{i + 1}</span><p className="mt-2">{t(`submit.${k}`)}</p></li>))}
      </ol>
      <div className="mt-10">
        {!user && (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auth/register/organizer" size="lg">{t("auth.submitOrganizer")}</ButtonLink>
            <ButtonLink href="/auth/login?next=/submit-event" variant="outline" size="lg">{t("nav.login")}</ButtonLink>
          </div>
        )}
        {isOrganizer && (<div className="space-y-4"><Alert tone="success"><span className="flex items-center gap-2"><CheckCircle2 className="size-4" aria-hidden="true" />{t("submit.alreadyOrganizer")}</span></Alert><ButtonLink href="/organizer/events/new" size="lg">{t("organizerArea.newEvent")}</ButtonLink></div>)}
        {user && !isOrganizer && pending && <Alert tone="info">{t("auth.applicationPending")}</Alert>}
        {user && !isOrganizer && !pending && (<><h2 className="mb-1 font-serif text-2xl font-medium">{t("submit.applyTitle")}</h2><p className="mb-6 text-muted">{t("submit.applyDesc")}</p><OrganizerApplyForm /></>)}
      </div>
      {user && (
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-medium">{t("suggest.title")}</h2>
          <p className="mt-2 mb-6 text-muted">{t("suggest.desc")}</p>
          <SuggestForm />
        </section>
      )}
    </Container>
  );
}
