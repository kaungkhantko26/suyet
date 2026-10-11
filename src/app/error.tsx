"use client";
import { TriangleAlert } from "lucide-react";
import { StatusPage } from "@/components/layout/status-page";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <StatusPage
      home={t("pages.goHome")}
      icon={<TriangleAlert className="size-8" />}
      code="500"
      title={t("pages.errorTitle")}
      body={t("pages.errorBody")}
      note={error.digest ? `Ref: ${error.digest}` : undefined}
      action={<Button onClick={reset}>{t("pages.tryAgain")}</Button>}
    />
  );
}
