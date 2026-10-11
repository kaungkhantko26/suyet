import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaVerifyForm } from "@/components/forms/mfa-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentUser, getPendingMfaUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/url";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Two-factor verification", robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeRedirectPath(next));
  if (!(await getPendingMfaUser())) redirect("/auth/login");
  const t = await getT();
  return <AuthShell title={t("mfa.title")} desc={t("mfa.desc")}><MfaVerifyForm next={safeRedirectPath(next)} /></AuthShell>;
}
