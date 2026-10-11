import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui/misc";
import { unsubscribeByToken } from "@/lib/services/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getT(), searchParams]);
  const ok = token && /^[\w-]{10,100}$/.test(token) ? await unsubscribeByToken(token) : false;
  return <AuthShell title={t("notify.unsubscribe")}><Alert tone={ok ? "success" : "error"}>{ok ? t("notify.unsubscribed") : t("notify.unsubscribeInvalid")}</Alert></AuthShell>;
}
