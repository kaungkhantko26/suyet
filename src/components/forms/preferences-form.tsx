"use client";
import { useState, useTransition } from "react";
import { savePreferencesAction } from "@/app/actions/student";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

interface Opt { value: string; label: string }
export interface PrefsValues { categoryIds: string[]; locationSlugs: string[]; onlineOnly: boolean; deadlineReminders: boolean; newEventAlerts: boolean; emailEnabled: boolean; inAppEnabled: boolean }

export function PreferencesForm({ categories, locations, initial }: { categories: Opt[]; locations: Opt[]; initial: PrefsValues }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (key: "categoryIds" | "locationSlugs", val: string) => setV((s) => ({ ...s, [key]: s[key].includes(val) ? s[key].filter((x) => x !== val) : [...s[key], val] }));
  const bool = (key: keyof PrefsValues, label: string) => <Checkbox label={label} checked={v[key] as boolean} onChange={(e) => setV((s) => ({ ...s, [key]: e.target.checked }))} />;
  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await savePreferencesAction(v); setMsg({ ok: r.ok, text: t(r.ok ? (r.message ?? "common.success") : (r.error ?? "common.error")) }); }); }}>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <fieldset><legend className="mb-2 text-base font-semibold">{t("dashboard.prefCategories")}</legend><div className="grid gap-x-4 sm:grid-cols-2">{categories.map((c) => <Checkbox key={c.value} label={c.label} checked={v.categoryIds.includes(c.value)} onChange={() => toggle("categoryIds", c.value)} />)}</div></fieldset>
      <fieldset><legend className="mb-2 text-base font-semibold">{t("dashboard.prefLocations")}</legend><div className="grid gap-x-4 sm:grid-cols-2">{locations.map((l) => <Checkbox key={l.value} label={l.label} checked={v.locationSlugs.includes(l.value)} onChange={() => toggle("locationSlugs", l.value)} />)}</div></fieldset>
      <fieldset><legend className="mb-2 text-base font-semibold">{t("dashboard.prefsTitle")}</legend>
        {bool("onlineOnly", t("dashboard.prefOnline"))}{bool("newEventAlerts", t("dashboard.prefNew"))}{bool("deadlineReminders", t("dashboard.prefDeadline"))}{bool("emailEnabled", t("dashboard.prefEmail"))}{bool("inAppEnabled", t("dashboard.prefInApp"))}
      </fieldset>
      <Button type="submit" disabled={pending}>{t("common.save")}</Button>
    </form>
  );
}
