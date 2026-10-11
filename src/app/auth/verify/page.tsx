import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { verifyEmail } from "@/lib/services/auth";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getT(), searchParams]);
  const ok = token ? await verifyEmail(token) : false;
  return (
    <AuthShell title={t("nav.register")}>
      <Alert tone={ok ? "success" : "error"}>{ok ? t("auth.verified") : t("auth.verifyFailed")}</Alert>
      <ButtonLink href={ok ? "/dashboard" : "/"} className="mt-5 w-full">{ok ? t("nav.dashboard") : t("pages.goHome")}</ButtonLink>
    </AuthShell>
  );
}
