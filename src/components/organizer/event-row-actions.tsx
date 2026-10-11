"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setOverridesAction, submitEventAction } from "@/app/actions/organizer";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function EventRowActions({ id, canSubmit, cancelled, closed, published }: { id: string; canSubmit: boolean; cancelled: boolean; closed: boolean; published: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit && <Button size="sm" disabled={pending} onClick={() => run(() => submitEventAction(id))}>{t("form.submitReview")}</Button>}
      {published && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setOverridesAction(id, { registrationClosedOverride: !closed }))}>{closed ? t("events.openOnly") : t("status.REGISTRATION_CLOSED")}</Button>}
      {published && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setOverridesAction(id, { cancelled: !cancelled }))}>{cancelled ? t("common.undo") : t("status.CANCELLED")}</Button>}
    </div>
  );
}
