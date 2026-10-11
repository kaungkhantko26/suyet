"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewSubmissionAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function ReviewForm({ submissionId }: { submissionId: string }) {
  const t = useT();
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (d: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") => start(async () => {
    setErr(null);
    const r = await reviewSubmissionAction(submissionId, d, notes);
    if (!r.ok) setErr(t(r.error ?? "common.error")); else router.refresh();
  });
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor={`n-${submissionId}`}>{t("admin.reviewNotes")}</label>
      <Textarea id={`n-${submissionId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      {err && <p role="alert" className="text-xs text-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => go("APPROVED")}>{t("admin.approve")}</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => go("CHANGES_REQUESTED")}>{t("admin.requestChanges")}</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => go("REJECTED")}>{t("admin.reject")}</Button>
      </div>
    </div>
  );
}
