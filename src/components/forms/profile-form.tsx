"use client";
import { useState, useTransition } from "react";
import { saveProfileAction } from "@/app/actions/student";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export interface ProfileValues { displayName: string; city: string; locationId: string; university: string; educationLevel: string; skills: string; bio: string; hideUniversity: boolean; hideSkills: boolean; hideBio: boolean }

export function ProfileForm({ initial, locations }: { initial: ProfileValues; locations: { value: string; label: string }[] }) {
  const t = useT();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await saveProfileAction(fd); setMsg({ ok: r.ok, text: t(r.ok ? (r.message ?? "common.success") : (r.error ?? "common.error")) }); }); }}>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <p className="text-sm text-muted">{t("dashboard.profileHint")}</p>
      <Field label={t("dashboard.displayName")} htmlFor="p-name"><Input id="p-name" name="displayName" defaultValue={initial.displayName} maxLength={80} /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dashboard.city")} htmlFor="p-city"><Input id="p-city" name="city" defaultValue={initial.city} /></Field>
        <Field label={t("dashboard.region")} htmlFor="p-loc"><Select id="p-loc" name="locationId" defaultValue={initial.locationId}><option value="">—</option>{locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</Select></Field>
        <Field label={t("dashboard.university")} htmlFor="p-uni"><Input id="p-uni" name="university" defaultValue={initial.university} /></Field>
        <Field label={t("dashboard.education")} htmlFor="p-edu"><Select id="p-edu" name="educationLevel" defaultValue={initial.educationLevel}><option value="">—</option>{(["HIGH_SCHOOL", "UNDERGRAD", "GRADUATE", "SELF_TAUGHT", "PROFESSIONAL"] as const).map((v) => <option key={v} value={v}>{t(`dashboard.levels.${v}`)}</option>)}</Select></Field>
      </div>
      <Field label={t("dashboard.skills")} htmlFor="p-skills" hint={t("dashboard.skillsHint")}><Input id="p-skills" name="skills" defaultValue={initial.skills} /></Field>
      <Field label={t("dashboard.bio")} htmlFor="p-bio"><Textarea id="p-bio" name="bio" defaultValue={initial.bio} maxLength={500} rows={4} /></Field>
      <Field label="Avatar" htmlFor="p-img" hint={t("form.bannerHint")}><input id="p-img" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-surface file:px-4" /></Field>
      <div><Checkbox name="hideUniversity" label={t("dashboard.hideUniversity")} defaultChecked={initial.hideUniversity} /><Checkbox name="hideSkills" label={t("dashboard.hideSkills")} defaultChecked={initial.hideSkills} /><Checkbox name="hideBio" label={t("dashboard.hideBio")} defaultChecked={initial.hideBio} /></div>
      <Button type="submit" disabled={pending}>{t("common.save")}</Button>
    </form>
  );
}
