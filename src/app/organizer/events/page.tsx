import type { Metadata } from "next";
import Link from "next/link";
import { EventRowActions } from "@/components/organizer/event-row-actions";
import { PublishBadge, SubmissionBadge } from "@/components/organizer/badges";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requireOrganizer } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { myEvents, submissionStatus } from "@/lib/organizer-data";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "My events", robots: { index: false } };

export default async function OrganizerEvents() {
  const user = await requireOrganizer("/organizer/events");
  const [t, events] = await Promise.all([getT(), myEvents(user)]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t("organizerArea.myEvents")}</h1>
        <ButtonLink href="/organizer/events/new">{t("organizerArea.newEvent")}</ButtonLink>
      </div>
      {events.length === 0 ? <EmptyState title={t("organizerArea.noEvents")} /> : (
        <ul className="space-y-3">
          {events.map((e) => {
            const sub = submissionStatus(e);
            const pendingUpdate = e.submissions[0]?.isUpdate && sub === "PENDING_REVIEW";
            return (
              <li key={e.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/organizer/events/${e.id}/edit`} className="font-semibold underline-offset-4 hover:underline">{e.title}</Link>
                      <p className="mt-1 text-sm text-muted">{e.organizer.name} · {formatDate(e.startAt, t.locale)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5"><PublishBadge state={e.publishState} t={t} /><SubmissionBadge status={sub} t={t} /></div>
                  </div>
                  {pendingUpdate && <p className="mt-2 text-sm text-muted">{t("form.changesQueued")}</p>}
                  {(sub === "CHANGES_REQUESTED" || sub === "REJECTED") && e.submissions[0]?.reviews[0]?.notes && <p className="mt-2 rounded-[8px] bg-warning-bg px-3 py-2 text-sm text-warning">{e.submissions[0].reviews[0].notes}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <ButtonLink href={`/organizer/events/${e.id}/edit`} size="sm" variant="outline">{t("common.edit")}</ButtonLink>
                    {e.registrationMode === "ON_PLATFORM" && <ButtonLink href={`/organizer/events/${e.id}/registration`} size="sm" variant="outline">{t("registration.manage")}</ButtonLink>}
                    <EventRowActions id={e.id} canSubmit={e.publishState === "DRAFT" && sub !== "PENDING_REVIEW"} cancelled={e.cancelled} closed={e.registrationClosedOverride} published={e.publishState === "PUBLISHED"} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
