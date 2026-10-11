"use client";
import { useState, useTransition } from "react";
import { contactAction } from "@/app/actions/public";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function ContactForm() {
  const t = useT();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const fd = new FormData(f);
        start(async () => {
          const r = await contactAction({ name: fd.get("name"), email: fd.get("email"), message: fd.get("message") });
          setState({ ok: r.ok, text: t(r.ok ? (r.message ?? "common.success") : (r.error ?? "common.error")) });
          if (r.ok) f.reset();
        });
      }}
    >
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.text}</Alert>}
      <Field label={t("pages.contactName")} htmlFor="c-name" required><Input id="c-name" name="name" required maxLength={100} autoComplete="name" /></Field>
      <Field label={t("common.email")} htmlFor="c-email" required><Input id="c-email" name="email" type="email" required autoComplete="email" /></Field>
      <Field label={t("pages.contactMessage")} htmlFor="c-msg" required><Textarea id="c-msg" name="message" required maxLength={4000} rows={6} /></Field>
      <Button type="submit" size="lg" disabled={pending}>{t("common.submit")}</Button>
    </form>
  );
}
