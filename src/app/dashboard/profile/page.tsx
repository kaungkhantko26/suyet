import type { Metadata } from "next";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getLocations } from "@/lib/events/lookups";
import { locationName } from "@/lib/events/view";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const [t, p, locs] = await Promise.all([getT(), db.userProfile.findUnique({ where: { userId: user.id } }), getLocations()]);
  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("dashboard.profileTitle")}</h1>
      <ProfileForm
        locations={locs.filter((l) => ["REGION", "STATE", "UNION_TERRITORY"].includes(l.type)).map((l) => ({ value: l.id, label: locationName(l, t.locale)! }))}
        initial={{ displayName: p?.displayName ?? user.name, city: p?.city ?? "", locationId: p?.locationId ?? "", university: p?.university ?? "", educationLevel: p?.educationLevel ?? "", skills: (p?.skills ?? []).join(", "), bio: p?.bio ?? "", hideUniversity: p?.hideUniversity ?? false, hideSkills: p?.hideSkills ?? false, hideBio: p?.hideBio ?? false }}
      />
    </div>
  );
}
