"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideRegistrationAction } from "@/app/actions/registration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

/** Approve / reject a participant. A short reason is required to reject and is shown to the participant. */
export function RegistrationDecision({ id, status, note }: { id: string; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note: string | null }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (d: "APPROVED" | "REJECTED") => { setErr(null); start(async () => { const r = await decideRegistrationAction(id, d, text); if (!r.ok) setErr(t(r.error ?? "common.error")); else router.refresh(); }); };
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <label className="sr-only" htmlFor={`dn-${id}`}>{t("registration.decisionNote")}</label>
      <Input id={`dn-${id}`} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t("registration.decisionNote")} />
      {err && <p role="alert" className="text-xs text-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || status === "APPROVED"} onClick={() => go("APPROVED")}>{t("registration.approve")}</Button>
        <Button size="sm" variant="danger" disabled={pending || status === "REJECTED"} onClick={() => go("REJECTED")}>{t("registration.reject")}</Button>
      </div>
    </div>
  );
}
