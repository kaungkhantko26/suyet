"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withdrawRegistrationAction } from "@/app/actions/registration";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function WithdrawButton({ eventId }: { eventId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm(t("registration.withdrawConfirm"))) start(async () => { await withdrawRegistrationAction(eventId); router.refresh(); }); }}>{t("registration.withdraw")}</Button>;
}
