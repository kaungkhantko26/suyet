"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applicationDecisionAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function ApplicationDecision({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (d: "APPROVED" | "REJECTED") => start(async () => { setErr(null); const r = await applicationDecisionAction(id, d, notes); if (!r.ok) setErr(t(r.error ?? "common.error")); else router.refresh(); });
  return (
    <div className="space-y-2">
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("admin.reviewNotes")} aria-label={t("admin.reviewNotes")} />
      {err && <p role="alert" className="text-xs text-error">{err}</p>}
      <div className="flex gap-2"><Button size="sm" disabled={pending} onClick={() => go("APPROVED")}>{t("admin.approve").replace(/ &.*/, "")}</Button><Button size="sm" variant="danger" disabled={pending} onClick={() => go("REJECTED")}>{t("admin.reject")}</Button></div>
    </div>
  );
}
