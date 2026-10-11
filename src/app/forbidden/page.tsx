import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { StatusPage } from "@/components/layout/status-page";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };
export default async function Forbidden() {
  const t = await getT();
  return <StatusPage home={t("pages.goHome")} icon={<ShieldAlert className="size-8" />} code="403" title={t("pages.forbiddenTitle")} body={t("pages.forbiddenBody")} />;
}
