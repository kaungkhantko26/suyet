import { SearchX } from "lucide-react";
import { StatusPage } from "@/components/layout/status-page";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return <StatusPage home={t("pages.goHome")} icon={<SearchX className="size-8" />} code="404" title={t("pages.notFoundTitle")} body={t("pages.notFoundBody")} action={<ButtonLink href="/events">{t("nav.explore")}</ButtonLink>} />;
}
