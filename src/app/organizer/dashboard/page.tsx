import type { Metadata } from "next";
import Link from "next/link";
import { Alert, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireOrganizer } from "@/lib/auth/guards";
import { myEvents, myOrganizers, submissionStatus } from "@/lib/organizer-data";
import { getT } from "@/i18n/server";
import { SubmissionBadge } from "@/components/organizer/badges";

export const metadata: Metadata = { title: "Organizer dashboard", robots: { index: false } };

export default async function OrganizerDashboard() {
  const user = await requireOrganizer("/organizer/dashboard");
  const [t, orgs, events] = await Promise.all([getT(), myOrganizers(user), myEvents(user)]);
  const count = (f: (e: (typeof events)[number]) => boolean) => events.filter(f).length;
  const stats = [
    [t("organizerArea.pub.PUBLISHED"), count((e) => e.publishState === "PUBLISHED")],
    [t("organizerArea.sub.PENDING_REVIEW"), count((e) => submissionStatus(e) === "PENDING_REVIEW")],
    [t("organizerArea.sub.CHANGES_REQUESTED"), count((e) => submissionStatus(e) === "CHANGES_REQUESTED")],
    [t("organizerArea.sub.DRAFT"), count((e) => e.publishState === "DRAFT" && submissionStatus(e) === "DRAFT")],
  ] as const;
  const feedback = events.filter((e) => submissionStatus(e) === "CHANGES_REQUESTED" || submissionStatus(e) === "REJECTED");
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t("organizerArea.dashboard")}</h1>
        {orgs.length > 0 && <ButtonLink href="/organizer/events/new">{t("organizerArea.newEvent")}</ButtonLink>}
      </div>
      {orgs.length === 0 && <Alert tone="warning">{t("organizerArea.noOrganizer")}</Alert>}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, n]) => (<Card key={label} className="p-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd></Card>))}
      </dl>
      {feedback.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("organizerArea.reviewNotes")}</h2>
          <ul className="space-y-3">
            {feedback.map((e) => (
              <li key={e.id}><Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/organizer/events/${e.id}/edit`} className="font-medium underline-offset-4 hover:underline">{e.title}</Link><SubmissionBadge status={submissionStatus(e)} t={t} /></div>
                <p className="mt-2 text-sm text-muted">{e.submissions[0]?.reviews[0]?.notes ?? "—"}</p>
              </Card></li>
            ))}
          </ul>
        </section>
      )}
      {events.length === 0 && orgs.length > 0 && <EmptyState title={t("organizerArea.noEvents")} action={<ButtonLink href="/organizer/events/new">{t("organizerArea.newEvent")}</ButtonLink>} />}
    </div>
  );
}
