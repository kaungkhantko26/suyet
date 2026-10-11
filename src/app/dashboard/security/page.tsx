import type { Metadata } from "next";
import { SecurityActions } from "@/components/forms/mfa-forms";
import { requireUser } from "@/lib/auth/guards";
import { isPrivileged } from "@/lib/auth/permissions";
import { isEnrolled } from "@/lib/services/mfa";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Security & privacy", robots: { index: false } };

export default async function SecurityPage() {
  const user = await requireUser("/dashboard/security");
  const [t, enabled] = await Promise.all([getT(), isEnrolled(user.id)]);
  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("securityPage.title")}</h1>
      <SecurityActions mfaEnabled={enabled} canDisableMfa={!isPrivileged(user.role)} />
    </div>
  );
}
