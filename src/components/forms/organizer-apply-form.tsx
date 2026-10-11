"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyOrganizerAction } from "@/app/actions/organizer";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function OrganizerApplyForm() {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const fe = (k: string) => (state?.fields?.[k] ? t(state.fields[k]) : undefined);
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget)); start(async () => { const r = await applyOrganizerAction(fd); setState({ ok: r.ok, text: t(r.ok ? (r.message ?? "submit.applySent") : (r.error ?? "common.error")), fields: r.fieldErrors }); if (r.ok) router.refresh(); }); }}>
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.text}</Alert>}
      <Field label={t("submit.orgName")} htmlFor="a-name" error={fe("name")} required><Input id="a-name" name="name" required /></Field>
      <Field label={t("submit.orgType")} htmlFor="a-type" required><Select id="a-type" name="type">{(["UNIVERSITY", "UNIVERSITY_CLUB", "TECH_COMMUNITY", "COMPANY", "NONPROFIT", "INDEPENDENT"] as const).map((v) => <option key={v} value={v}>{t(`organizers.types.${v}`)}</option>)}</Select></Field>
      <Field label={t("submit.orgDesc")} htmlFor="a-desc" error={fe("description")} required><Textarea id="a-desc" name="description" required rows={4} /></Field>
      <Field label={t("submit.orgEmail")} htmlFor="a-mail" error={fe("contactEmail")} required><Input id="a-mail" name="contactEmail" type="email" required /></Field>
      <Field label={t("submit.orgWebsite")} htmlFor="a-web" error={fe("website")}><Input id="a-web" name="website" type="url" /></Field>
      <Field label={t("submit.orgEvidence")} htmlFor="a-ev" error={fe("evidenceUrl")}><Input id="a-ev" name="evidenceUrl" type="url" /></Field>
      <Button type="submit" size="lg" disabled={pending}>{t("common.submit")}</Button>
    </form>
  );
}
