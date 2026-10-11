"use client";
import { Flag, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { reportEventAction } from "@/app/actions/public";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

const REASONS = ["INCORRECT_DATE", "INCORRECT_LINK", "CANCELLED", "SCAM_OR_UNSAFE", "DUPLICATE", "OTHER"] as const;

export function ReportDialog({ eventId }: { eventId: string }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => ref.current?.showModal()} aria-haspopup="dialog"><Flag className="size-4" aria-hidden="true" />{t("details.report")}</Button>
      <dialog ref={ref} aria-labelledby="report-title" onClose={() => setState(null)} className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-[16px] border border-border bg-surface p-0 text-fg backdrop:bg-black/40">
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await reportEventAction({ eventId, reason: fd.get("reason"), details: fd.get("details") });
              setState({ ok: r.ok, text: t(r.ok ? (r.message ?? "report.sent") : (r.error ?? "common.error")) });
            });
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="report-title" className="text-lg font-semibold">{t("report.title")}</h2>
            <button type="button" aria-label={t("nav.close")} onClick={() => ref.current?.close()} className="-mt-2 -mr-2 flex size-11 cursor-pointer items-center justify-center rounded-[10px] hover:bg-fg/5"><X className="size-5" aria-hidden="true" /></button>
          </div>
          {state?.ok ? <Alert tone="success">{state.text}</Alert> : (
            <>
              {state && <Alert tone="error">{state.text}</Alert>}
              <Field label={t("report.reason")} htmlFor="rp-reason">
                <Select id="rp-reason" name="reason" required defaultValue="INCORRECT_DATE">{REASONS.map((r) => <option key={r} value={r}>{t(`report.${r}`)}</option>)}</Select>
              </Field>
              <Field label={t("report.details")} htmlFor="rp-details" hint={t("report.detailsHint")} required>
                <Textarea id="rp-details" name="details" required maxLength={2000} />
              </Field>
              <Button type="submit" disabled={pending} className="w-full">{t("common.submit")}</Button>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
