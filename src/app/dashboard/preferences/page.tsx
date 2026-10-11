import type { Metadata } from "next";
import { PreferencesForm } from "@/components/forms/preferences-form";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getLocations } from "@/lib/events/lookups";
import { locationName } from "@/lib/events/view";
import { formOptions } from "@/lib/form-options";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Preferences", robots: { index: false } };

export default async function PreferencesPage() {
  const user = await requireUser("/dashboard/preferences");
  const t = await getT();
  const [opts, locs, interests, p] = await Promise.all([formOptions(t.locale), getLocations(), db.userInterest.findMany({ where: { userId: user.id } }), db.notificationPreference.findUnique({ where: { userId: user.id } })]);
  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("dashboard.prefsTitle")}</h1>
      <PreferencesForm
        categories={opts.categories}
        locations={locs.filter((l) => ["REGION", "STATE", "UNION_TERRITORY"].includes(l.type)).map((l) => ({ value: l.slug, label: locationName(l, t.locale)! }))}
        initial={{ categoryIds: interests.map((i) => i.categoryId), locationSlugs: p?.locationSlugs ?? [], onlineOnly: p?.onlineOnly ?? false, deadlineReminders: p?.deadlineReminders ?? true, newEventAlerts: p?.newEventAlerts ?? true, emailEnabled: p?.emailEnabled ?? true, inAppEnabled: p?.inAppEnabled ?? true }}
      />
    </div>
  );
}
