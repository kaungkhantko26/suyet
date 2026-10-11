import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap, Building2 } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/url";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Choose your account type", robots: { index: false } };

/** Shown once, right after a brand-new Google sign-up (Google can't tell us student vs organizer). */
export default async function ChooseRolePage({ searchParams }: { searchParams: Promise<{ next?: string; intent?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  const { next, intent } = await searchParams;
  const dest = safeRedirectPath(next);
  const t = await getT();

  return (
    <AuthShell title={t("auth.chooseRoleTitle")} desc={t("auth.chooseRoleDesc")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface-2 p-5 text-center">
          <GraduationCap className="mx-auto size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">{t("auth.chooseRoleStudent")}</p>
            <p className="mt-1 text-sm text-muted">{t("auth.chooseRoleStudentDesc")}</p>
          </div>
          <ButtonLink href={dest} className="mt-auto">{t("auth.chooseRoleStudent")}</ButtonLink>
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface-2 p-5 text-center">
          <Building2 className="mx-auto size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">{t("auth.chooseRoleOrganizer")}</p>
            <p className="mt-1 text-sm text-muted">{t("auth.chooseRoleOrganizerDesc")}</p>
          </div>
          <ButtonLink href="/submit-event" variant="outline" className="mt-auto">{t("auth.chooseRoleOrganizer")}</ButtonLink>
        </div>
      </div>
      {intent === "organizer" && <p className="mt-4 text-center text-xs text-muted">{t("auth.chooseRoleHint")}</p>}
    </AuthShell>
  );
}
