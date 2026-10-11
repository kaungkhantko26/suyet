import type { Metadata } from "next";
import { EventForm } from "@/components/forms/event-form";
import { Alert } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { requireOrganizer } from "@/lib/auth/guards";
import { formOptions } from "@/lib/form-options";
import { myOrganizers } from "@/lib/organizer-data";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Create event", robots: { index: false } };

export default async function NewEventPage() {
  const user = await requireOrganizer("/organizer/events/new");
  const t = await getT();
  const [orgs, opts] = await Promise.all([myOrganizers(user), formOptions(t.locale)]);
  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("organizerArea.newEvent")}</h1>
      {orgs.length === 0 ? <Alert tone="warning">{t("organizerArea.noOrganizer")}</Alert> : (
        <EventForm {...opts} organizers={orgs.map((o) => ({ value: o.id, label: o.name }))} isAdmin={can(user.role, "events.manage")} />
      )}
    </div>
  );
}
