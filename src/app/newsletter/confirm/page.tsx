import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui/misc";
import { confirmNewsletter } from "@/lib/services/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getT(), searchParams]);
  const ok = token && /^[\w-]{10,100}$/.test(token) ? await confirmNewsletter(token) : false;
  return <AuthShell title={t("home.newsletterTitle")}><Alert tone={ok ? "success" : "error"}>{ok ? t("common.success") : t("notify.unsubscribeInvalid")}</Alert></AuthShell>;
}
