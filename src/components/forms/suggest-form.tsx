"use client";
import { useState, useTransition } from "react";
import { suggestEventAction } from "@/app/actions/public";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function SuggestForm() {
  const t = useT();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = Object.fromEntries(new FormData(f)); start(async () => { const r = await suggestEventAction(fd); setMsg({ ok: r.ok, text: t(r.ok ? (r.message ?? "common.success") : (r.error ?? "common.error")) }); if (r.ok) f.reset(); }); }}>
      {msg && <Alert tone={msg.ok ? "success" : "error"} className="sm:col-span-2">{msg.text}</Alert>}
      <Field label={t("suggest.titleLabel")} htmlFor="sg-title" required><Input id="sg-title" name="title" required maxLength={200} /></Field>
      <Field label={t("suggest.url")} htmlFor="sg-url" required hint="https://…"><Input id="sg-url" name="url" type="url" inputMode="url" required /></Field>
      <Field label={t("suggest.note")} htmlFor="sg-note" className="sm:col-span-2"><Textarea id="sg-note" name="note" rows={2} maxLength={500} /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{t("suggest.send")}</Button></div>
    </form>
  );
}
