"use client";
import { useRef, useState, useTransition } from "react";
import { BadgeCheck, Camera, Globe2, Mail, Plus, Send, UserRound } from "lucide-react";
import { updateOrganizerProfileAction } from "@/app/actions/organizer";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export interface OrgProfile {
  id: string; name: string; description: string; website: string; facebook: string;
  telegram: string; contactEmail: string; logoUrl: string; verified: boolean;
}

export function OrganizerProfileManager({ profiles }: { profiles: OrgProfile[] }) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];
  if (!selected) return null;
  return (
    <div className="max-w-3xl space-y-6">
      {profiles.length > 1 && (
        <div className="rounded-[16px] border border-border bg-surface p-5">
          <Field label="Editing organization" htmlFor="organization-profile-picker" hint="Choose which organizer profile you want to update.">
            <Select id="organization-profile-picker" value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? " · Verified" : ""}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <OrganizerProfileForm key={selected.id} org={selected} />
    </div>
  );
}

export function OrganizerProfileForm({ org }: { org: OrgProfile }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(org.logoUrl);
  const [showSocial, setShowSocial] = useState(Boolean(org.facebook || org.telegram));
  const [state, setState] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const fe = (k: string) => (state?.fields?.[k] ? t(state.fields[k]) : undefined);

  return (
    <form className="space-y-8" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      start(async () => {
        const r = await updateOrganizerProfileAction(fd);
        setState({ ok: r.ok, text: t(r.ok ? (r.message ?? "form.saved") : (r.error ?? "common.error")), fields: r.fieldErrors });
      });
    }}>
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.text}</Alert>}
      <input type="hidden" name="organizerId" value={org.id} />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative size-28 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border bg-surface-2 shadow-(--shadow-raised)" aria-label="Change profile image">
          {preview ? <span role="img" aria-label={`${org.name} profile image`} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(preview).slice(1, -1)})` }} /> : <UserRound className="absolute inset-0 m-auto size-12 text-muted" aria-hidden="true" />}
          <span className="absolute inset-x-0 bottom-0 flex h-9 items-center justify-center gap-1 bg-fg/80 text-xs font-semibold text-bg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-3.5" />Edit</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-serif text-2xl font-medium">{org.name}</p>{org.verified && <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><BadgeCheck className="size-4" />Verified</span>}</div>
          <p className="mt-1 text-sm text-muted">Click the profile image to replace it. JPG, PNG or WebP.</p>
          <input ref={fileRef} id={`o-logo-${org.id}`} name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }} />
        </div>
      </div>

      <section className="space-y-5 rounded-[16px] border border-border bg-surface p-5 sm:p-6">
        <div><h2 className="font-serif text-xl font-medium">Profile details</h2><p className="mt-1 text-sm text-muted">This information appears on your public organizer page.</p></div>
        <Field label={t("submit.orgName")} htmlFor={`o-name-${org.id}`} error={fe("name")} required><Input id={`o-name-${org.id}`} name="name" defaultValue={org.name} required /></Field>
        <Field label="About" htmlFor={`o-desc-${org.id}`} error={fe("description")}><Textarea id={`o-desc-${org.id}`} name="description" defaultValue={org.description} rows={5} maxLength={2000} placeholder="Tell students what your organization does and the events you run." /></Field>
      </section>

      <section className="space-y-5 rounded-[16px] border border-border bg-surface p-5 sm:p-6">
        <div><h2 className="font-serif text-xl font-medium">Contact and links</h2><p className="mt-1 text-sm text-muted">Use official links students can trust.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("organizers.website")} htmlFor={`o-web-${org.id}`} error={fe("website")}><div className="relative"><Globe2 className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" /><Input className="pl-10" id={`o-web-${org.id}`} name="website" type="url" defaultValue={org.website} placeholder="https://example.org" /></div></Field>
          <Field label={t("submit.orgEmail")} htmlFor={`o-mail-${org.id}`} error={fe("contactEmail")}><div className="relative"><Mail className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" /><Input className="pl-10" id={`o-mail-${org.id}`} name="contactEmail" type="email" defaultValue={org.contactEmail} placeholder="events@example.org" /></div></Field>
        </div>
        {showSocial ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("organizers.facebook")} htmlFor={`o-fb-${org.id}`} error={fe("facebook")}><Input id={`o-fb-${org.id}`} name="facebook" type="url" defaultValue={org.facebook} placeholder="https://facebook.com/..." /></Field>
            <Field label={t("organizers.telegram")} htmlFor={`o-tg-${org.id}`} error={fe("telegram")}><div className="relative"><Send className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" /><Input className="pl-10" id={`o-tg-${org.id}`} name="telegram" type="url" defaultValue={org.telegram} placeholder="https://t.me/..." /></div></Field>
          </div>
        ) : (
          <><input type="hidden" name="facebook" value="" /><input type="hidden" name="telegram" value="" /><Button type="button" variant="outline" onClick={() => setShowSocial(true)}><Plus className="size-4" />Add social links</Button></>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving…" : t("organizerArea.saveProfile")}</Button><span className="text-sm text-muted">Changes are visible on your organizer profile after saving.</span></div>
    </form>
  );
}
