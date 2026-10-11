import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import { EventGrid } from "@/components/events/event-grid";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { eventCardInclude, publicWhere } from "@/lib/events/queries";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Saved events", robots: { index: false } };

export default async function SavedPage() {
  const user = await requireUser("/dashboard/saved");
  const t = await getT();
  const rows = await db.savedEvent.findMany({ where: { userId: user.id, event: publicWhere }, include: { event: { include: eventCardInclude } }, orderBy: { createdAt: "desc" } });
  const events = rows.map((r) => r.event);
  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("dashboard.saved")}</h1>
      {events.length ? <EventGrid events={events} t={t} savedIds={new Set(events.map((e) => e.id))} authed /> : (
        <EmptyState icon={<Bookmark className="size-10" aria-hidden="true" />} title={t("dashboard.emptySaved")} body={t("dashboard.emptySavedHint")} action={<ButtonLink href="/events">{t("nav.explore")}</ButtonLink>} />
      )}
    </div>
  );
}
