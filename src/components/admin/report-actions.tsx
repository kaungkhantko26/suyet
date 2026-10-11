"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function ReportActions({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const set = (s: "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED") => start(async () => { await reportStatusAction(id, s, notes); router.refresh(); });
  return (
    <div className="space-y-2">
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.notes")} aria-label={t("common.notes")} />
      <div className="flex flex-wrap gap-2">{(["INVESTIGATING", "RESOLVED", "DISMISSED", "OPEN"] as const).map((s) => <Button key={s} size="sm" variant="outline" disabled={pending} onClick={() => set(s)}>{t(`admin.ReportStatus.${s}`)}</Button>)}</div>
    </div>
  );
}
