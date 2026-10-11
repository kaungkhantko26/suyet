import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { StatusPage } from "@/components/layout/status-page";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Please log in", robots: { index: false } };
export default async function Unauthorized() {
  const t = await getT();
  return <StatusPage home={t("pages.goHome")} icon={<Lock className="size-8" />} code="401" title={t("pages.unauthorizedTitle")} body={t("pages.unauthorizedBody")} action={<ButtonLink href="/auth/login">{t("nav.login")}</ButtonLink>} />;
}
