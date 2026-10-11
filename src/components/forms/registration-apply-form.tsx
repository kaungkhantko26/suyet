"use client";
import { useState, useTransition } from "react";
import { submitRegistrationAction } from "@/app/actions/registration";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import type { FieldType } from "@/lib/registration/schema";

export interface ApplyField { id: string; type: FieldType; label: string; helpText: string | null; required: boolean; options: string[]; maxLength?: number }

export function RegistrationApplyForm({ slug, fields, consent }: { slug: string; fields: ApplyField[]; consent: string }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [agreed, setAgreed] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string; pending?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, v: unknown) => setValues((s) => ({ ...s, [id]: v }));

  if (msg?.ok) return <Alert tone="success"><p className="font-medium">{msg.pending ? t("registration.successPending") : t("registration.success")}</p>{msg.text && !msg.pending && <p className="mt-1 whitespace-pre-line">{msg.text}</p>}</Alert>;

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null); setErrs({});
        if (!agreed) { setMsg({ ok: false, text: t("registration.consentRequired") }); return; }
        start(async () => {
          const r = await submitRegistrationAction(slug, values);
          if (r.fieldErrors) setErrs(r.fieldErrors);
          if (r.ok) setMsg({ ok: true, pending: (r.data as { status?: string } | undefined)?.status === "SUBMITTED", text: r.message && r.message !== "registration.success" ? r.message : "" }); // keep the confirmation on screen; the page shows "registered" on next load
          else setMsg({ ok: false, text: t(r.error ?? "common.error") });
        });
      }}
    >
      {msg && !msg.ok && <Alert tone="error">{msg.text}</Alert>}
      {fields.map((f) => {
        const id = `f-${f.id}`, err = errs[f.id] ? t(errs[f.id]) : undefined;
        const common = { htmlFor: id, label: f.label, required: f.required, error: err, hint: f.helpText ?? undefined };
        switch (f.type) {
          case "LONG_TEXT": return <Field key={f.id} {...common}><Textarea id={id} rows={4} maxLength={f.maxLength ?? 2000} aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "SHORT_TEXT": return <Field key={f.id} {...common}><Input id={id} maxLength={f.maxLength ?? 300} aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "EMAIL": return <Field key={f.id} {...common}><Input id={id} type="email" inputMode="email" aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "PHONE": return <Field key={f.id} {...common}><Input id={id} type="tel" inputMode="tel" aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "NUMBER": return <Field key={f.id} {...common}><Input id={id} type="number" inputMode="decimal" aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "DATE": return <Field key={f.id} {...common}><Input id={id} type="date" aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)} /></Field>;
          case "DROPDOWN": return <Field key={f.id} {...common}><Select id={id} defaultValue="" aria-invalid={!!err} onChange={(e) => set(f.id, e.target.value)}><option value="" disabled>—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</Select></Field>;
          case "SINGLE_CHOICE":
            return (
              <fieldset key={f.id} className="space-y-1" aria-describedby={err ? `${id}-error` : undefined}>
                <legend className="mb-1 text-sm font-medium">{f.label}{f.required && <span className="text-error" aria-hidden="true"> *</span>}</legend>
                {f.helpText && <p className="text-xs text-muted">{f.helpText}</p>}
                {f.options.map((o) => <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="radio" name={id} value={o} className="size-5 accent-primary" onChange={() => set(f.id, o)} />{o}</label>)}
                {err && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-error">{err}</p>}
              </fieldset>
            );
          case "MULTIPLE_CHOICE":
            return (
              <fieldset key={f.id} className="space-y-1">
                <legend className="mb-1 text-sm font-medium">{f.label}{f.required && <span className="text-error" aria-hidden="true"> *</span>}</legend>
                {f.helpText && <p className="text-xs text-muted">{f.helpText}</p>}
                {f.options.map((o) => { const cur = (values[f.id] as string[] | undefined) ?? []; return <Checkbox key={o} label={o} checked={cur.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />; })}
                {err && <p role="alert" className="text-xs font-medium text-error">{err}</p>}
              </fieldset>
            );
          case "CHECKBOX":
            return <div key={f.id}><Checkbox label={<>{f.label}{f.required && <span className="text-error" aria-hidden="true"> *</span>}</>} checked={values[f.id] === true} onChange={(e) => set(f.id, e.target.checked)} />{f.helpText && <p className="ml-8 text-xs text-muted">{f.helpText}</p>}{err && <p role="alert" className="ml-8 text-xs font-medium text-error">{err}</p>}</div>;
        }
      })}
      <div className="rounded-[12px] border border-border bg-surface-2 p-4">
        <Checkbox label={consent} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t("common.loading") : t("registration.submit")}</Button>
    </form>
  );
}
