import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm, type EventFormValues } from "@/components/forms/event-form";
import { can } from "@/lib/auth/permissions";
import { canManageOrganizer, requireOrganizer } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { toDateTimeLocal } from "@/lib/dates";
import { formOptions } from "@/lib/form-options";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Edit event", robots: { index: false } };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOrganizer(`/organizer/events/${id}/edit`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const e = await db.event.findFirst({ where: { id, deletedAt: null }, include: { categories: true } });
  if (!e || !(await canManageOrganizer(user, e.organizerId))) notFound(); // don't reveal other organizers' events
  const t = await getT();
  const opts = await formOptions(t.locale);
  const sched = Array.isArray(e.schedule) ? (e.schedule as { time: string; title: string }[]).map((s) => `${s.time} | ${s.title}`).join("\n") : "";
  const defaults: EventFormValues = {
    title: e.title, slug: e.slug, shortDescription: e.shortDescription, description: e.description, categoryIds: e.categories.map((c) => c.categoryId),
    startAt: toDateTimeLocal(e.startAt), endAt: toDateTimeLocal(e.endAt), registrationDeadline: toDateTimeLocal(e.registrationDeadline),
    format: e.format, country: e.country, locationId: e.locationId ?? "", city: e.city ?? "", venue: e.venue ?? "", address: e.address ?? "",
    onlineUrl: e.onlineUrl ?? "", registrationMode: e.registrationMode, registrationUrl: e.registrationUrl ?? "", sourceUrl: e.sourceUrl ?? "", eligibility: e.eligibility ?? "",
    skillLevel: e.skillLevel, requirements: e.requirements ?? "", feeAmount: String(e.feeAmount), currency: e.currency, teamAllowed: e.teamAllowed,
    minTeamSize: e.minTeamSize?.toString() ?? "", maxTeamSize: e.maxTeamSize?.toString() ?? "", prizes: e.prizes ?? "", scheduleText: sched, contactInfo: e.contactInfo ?? "",
  };
  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("organizerArea.editEvent")}</h1>
      <EventForm {...opts} eventId={e.id} defaults={defaults} currentBanner={e.bannerUrl} published={e.publishState === "PUBLISHED"} isAdmin={can(user.role, "events.manage")} />
    </div>
  );
}
