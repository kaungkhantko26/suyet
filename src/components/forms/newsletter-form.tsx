"use client";
import { useState, useTransition } from "react";
import { subscribeAction } from "@/app/actions/public";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function NewsletterForm() {
  const t = useT();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await subscribeAction(String(fd.get("email") ?? ""));
          setState({ ok: r.ok, text: r.ok ? t("home.newsletterOk") : t(r.error ?? "common.error") });
        });
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="nl-email" className="sr-only">{t("common.email")}</label>
        <Input id="nl-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder={t("home.newsletterPlaceholder")} />
        <Button type="submit" disabled={pending}>{t("home.newsletterCta")}</Button>
      </div>
      {state && <Alert tone={state.ok ? "success" : "error"} className="mt-3">{state.text}</Alert>}
    </form>
  );
}
