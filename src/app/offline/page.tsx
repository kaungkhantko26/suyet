import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { StatusPage } from "@/components/layout/status-page";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };
export default async function Offline() {
  const t = await getT();
  return <StatusPage home={t("pages.goHome")} icon={<WifiOff className="size-8" />} title={t("pages.offlineTitle")} body={t("pages.offlineBody")} />;
}
