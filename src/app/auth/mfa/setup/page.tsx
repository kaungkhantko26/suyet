import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaSetup } from "@/components/forms/mfa-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui/misc";
import { getCurrentUser, getPendingMfaUser } from "@/lib/auth/session";
import { isPrivileged } from "@/lib/auth/permissions";
import { safeRedirectPath } from "@/lib/url";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Set up two-factor authentication", robots: { index: false } };

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = (await getCurrentUser()) ?? (await getPendingMfaUser());
  if (!user) redirect("/auth/login");
  const t = await getT();
  return (
    <AuthShell title={t("mfa.setupTitle")} desc={t("mfa.setupDesc")}>
      {isPrivileged(user.role) && <Alert tone="warning" className="mb-5">{t("mfa.requiredForRole")}</Alert>}
      <MfaSetup next={safeRedirectPath(next)} />
    </AuthShell>
  );
}
