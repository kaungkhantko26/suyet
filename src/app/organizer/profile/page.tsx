import type { Metadata } from "next";
import { OrganizerProfileManager } from "@/components/forms/organizer-profile-form";
import { Alert } from "@/components/ui/misc";
import { requireOrganizer } from "@/lib/auth/guards";
import { myOrganizers } from "@/lib/organizer-data";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Organizer profile", robots: { index: false } };

export default async function OrganizerProfilePage() {
  const user = await requireOrganizer("/organizer/profile");
  const [t, orgs] = await Promise.all([getT(), myOrganizers(user)]);
  return (
    <div className="space-y-10">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("organizerArea.profile")}</h1>
      {orgs.length === 0 && <Alert tone="warning">{t("organizerArea.noOrganizer")}</Alert>}
      <OrganizerProfileManager profiles={orgs.map((o) => ({ id: o.id, name: o.name, description: o.description ?? "", website: o.website ?? "", facebook: o.facebook ?? "", telegram: o.telegram ?? "", contactEmail: o.contactEmail ?? "", logoUrl: o.logoUrl ?? "", verified: o.status === "VERIFIED" }))} />
    </div>
  );
}
