"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { candidatePromoteAction, createSourceAction, organizerOpAction, saveCategoryAction, userOpAction, verifyEventAction, verifyOrganizerAction } from "@/app/actions/admin";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { iconNames } from "@/components/ui/category-icon";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

function useAction() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) => start(async () => {
    const r = await fn();
    setMsg({ ok: r.ok, text: t(r.ok ? (r.message ?? "common.success") : (r.error ?? "common.error")), fields: r.fieldErrors });
    if (r.ok) { onOk?.(); router.refresh(); }
  });
  const box: ReactNode = msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>;
  return { t, pending, run, msg, box };
}

export function VerifyForm({ eventId, status, sourceUrl }: { eventId: string; status: string; sourceUrl: string }) {
  const { t, pending, run, box } = useAction();
  return (
    <form className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => verifyEventAction(eventId, fd.get("status") as never, String(fd.get("source") ?? ""), String(fd.get("notes") ?? ""))); }}>
      <Select name="status" defaultValue={status} aria-label={t("common.status")}>{(["UNVERIFIED", "PENDING_VERIFICATION", "VERIFIED", "NEEDS_REVIEW"] as const).map((v) => <option key={v} value={v}>{t(`verification.${v}`)}</option>)}</Select>
      <Input name="source" type="url" defaultValue={sourceUrl} placeholder={t("admin.sourceUrlLabel")} aria-label={t("admin.sourceUrlLabel")} />
      <Button type="submit" size="sm" disabled={pending}>{t("common.update")}</Button>
      <Input name="notes" placeholder={t("common.notes")} aria-label={t("common.notes")} className="sm:col-span-3" />
      <div className="sm:col-span-3">{box}</div>
    </form>
  );
}

export function RoleSelect({ userId, role, options }: { userId: string; role: string; options: string[] }) {
  const { t, pending, run, box } = useAction();
  return (
    <span className="inline-flex flex-col">
      <Select aria-label={t("admin.role")} defaultValue={role} disabled={pending} className="min-h-9 w-36 text-[13px]" onChange={(e) => run(() => userOpAction(userId, e.target.value as never))}>
        {options.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
      {box}
    </span>
  );
}

export function CategoryForm({ initial }: { initial?: { id: string; nameEn: string; nameMy: string; icon: string } }) {
  const { t, pending, run, msg, box } = useAction();
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); run(() => saveCategoryAction({ id: initial?.id, nameEn: fd.get("nameEn"), nameMy: fd.get("nameMy"), icon: fd.get("icon") }), () => !initial && f.reset()); }}>
      <Field label="English" htmlFor={`en-${initial?.id ?? "new"}`} error={msg?.fields?.nameEn ? t(msg.fields.nameEn) : undefined}><Input id={`en-${initial?.id ?? "new"}`} name="nameEn" defaultValue={initial?.nameEn} required /></Field>
      <Field label="မြန်မာ" htmlFor={`my-${initial?.id ?? "new"}`}><Input id={`my-${initial?.id ?? "new"}`} name="nameMy" defaultValue={initial?.nameMy} required lang="my" /></Field>
      <Field label="Icon" htmlFor={`ic-${initial?.id ?? "new"}`}><Select id={`ic-${initial?.id ?? "new"}`} name="icon" defaultValue={initial?.icon ?? "sparkles"}>{[...iconNames, "sparkles"].map((n) => <option key={n}>{n}</option>)}</Select></Field>
      <Button type="submit" disabled={pending}>{initial ? t("common.save") : t("common.create")}</Button>
      <div className="sm:col-span-4">{!msg?.ok && box}</div>
    </form>
  );
}

export function SourceForm() {
  const { t, pending, run, msg, box } = useAction();
  const types = ["OFFICIAL_WEBSITE", "PUBLIC_API", "RSS_FEED", "MANUAL_SUBMISSION", "COMMUNITY_SUBMISSION", "AUTHORIZED_AUTOMATION"];
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = Object.fromEntries(new FormData(f)); run(() => createSourceAction(fd), () => f.reset()); }}>
      <Field label={t("common.name")} htmlFor="s-name" required><Input id="s-name" name="name" required /></Field>
      <Field label="URL" htmlFor="s-url" required error={msg?.fields?.url ? t(msg.fields.url) : undefined}><Input id="s-url" name="url" type="url" required /></Field>
      <Field label="Type" htmlFor="s-type"><Select id="s-type" name="type">{types.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ").toLowerCase()}</option>)}</Select></Field>
      <Field label="Organization" htmlFor="s-org"><Input id="s-org" name="organization" /></Field>
      <Field label="Reliability notes" htmlFor="s-notes" className="sm:col-span-2"><Textarea id="s-notes" name="reliabilityNotes" rows={2} /></Field>
      <div className="sm:col-span-2 flex items-center gap-3"><Button type="submit" disabled={pending}>{t("common.create")}</Button>{!msg?.ok && box}</div>
    </form>
  );
}

export interface CandidateDefaults { id: string; title: string; description: string; sourceUrl: string; registrationUrl: string; startAt: string; endAt: string; registrationDeadline: string; format: string; city: string }
export function CandidatePromote({ c, organizers, categories, locations }: { c: CandidateDefaults; organizers: { value: string; label: string }[]; categories: { value: string; label: string }[]; locations: { value: string; label: string }[] }) {
  const { t, pending, run, msg, box } = useAction();
  const [cats, setCats] = useState<string[]>([]);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      run(() => candidatePromoteAction(c.id, String(fd.get("organizerId")), {
        title: fd.get("title"), shortDescription: fd.get("shortDescription"), description: fd.get("description"), categoryIds: cats, startAt: fd.get("startAt"), endAt: fd.get("endAt"),
        registrationDeadline: fd.get("registrationDeadline"), format: fd.get("format"), locationId: fd.get("locationId"), city: fd.get("city"), onlineUrl: fd.get("format") === "ONSITE" ? "" : fd.get("sourceUrl"),
        registrationUrl: fd.get("registrationUrl"), sourceUrl: fd.get("sourceUrl"),
      }));
    }}>
      <Field label={t("events.organizer")} htmlFor={`o-${c.id}`} required><Select id={`o-${c.id}`} name="organizerId" required>{organizers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
      <Field label={t("form.eventTitle")} htmlFor={`t-${c.id}`} required><Input id={`t-${c.id}`} name="title" defaultValue={c.title} required /></Field>
      <Field label={t("form.short")} htmlFor={`sd-${c.id}`} required className="sm:col-span-2"><Input id={`sd-${c.id}`} name="shortDescription" defaultValue={c.description.slice(0, 200)} required /></Field>
      <Field label={t("form.full")} htmlFor={`d-${c.id}`} required className="sm:col-span-2"><Textarea id={`d-${c.id}`} name="description" defaultValue={c.description} required rows={3} /></Field>
      <Field label={t("form.start")} htmlFor={`s-${c.id}`} required error={msg?.fields?.startAt ? t(msg.fields.startAt) : undefined}><Input id={`s-${c.id}`} name="startAt" type="datetime-local" defaultValue={c.startAt} required /></Field>
      <Field label={t("form.end")} htmlFor={`e-${c.id}`}><Input id={`e-${c.id}`} name="endAt" type="datetime-local" defaultValue={c.endAt} /></Field>
      <Field label={t("form.deadline")} htmlFor={`dl-${c.id}`}><Input id={`dl-${c.id}`} name="registrationDeadline" type="datetime-local" defaultValue={c.registrationDeadline} /></Field>
      <Field label={t("form.format")} htmlFor={`f-${c.id}`}><Select id={`f-${c.id}`} name="format" defaultValue={c.format || "ONLINE"}>{(["ONSITE", "ONLINE", "HYBRID"] as const).map((v) => <option key={v} value={v}>{t(`format.${v}`)}</option>)}</Select></Field>
      <Field label={t("form.region")} htmlFor={`l-${c.id}`}><Select id={`l-${c.id}`} name="locationId"><option value="">—</option>{locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</Select></Field>
      <Field label={t("form.city")} htmlFor={`c-${c.id}`}><Input id={`c-${c.id}`} name="city" defaultValue={c.city} /></Field>
      <input type="hidden" name="sourceUrl" value={c.sourceUrl} /><input type="hidden" name="registrationUrl" value={c.registrationUrl} />
      <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-medium">{t("form.categories")}</legend><div className="grid gap-x-4 sm:grid-cols-3">{categories.map((k) => <Checkbox key={k.value} label={k.label} checked={cats.includes(k.value)} onChange={(e) => setCats(e.target.checked ? [...cats, k.value] : cats.filter((x) => x !== k.value))} />)}</div></fieldset>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" size="sm" disabled={pending}>{t("admin.promote")}</Button>{!msg?.ok && box}</div>
    </form>
  );
}

const METHODS = [["ORG_DOMAIN_EMAIL", "Organization-domain email"], ["OFFICIAL_WEBSITE", "Official website confirmation"], ["INDEPENDENT_CONTACT", "Independent contact (phone/known person)"], ["SOCIAL_ACCOUNT", "Established social account"], ["MANUAL_ADMIN", "Manual admin verification"]] as const;

/** Verified Organizer badge: needs a recorded method and written evidence. */
export function OrganizerVerifyForm({ id }: { id: string }) {
  const { t, pending, run, box } = useAction();
  return (
    <form className="grid gap-3 sm:grid-cols-[14rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => verifyOrganizerAction(id, String(fd.get("method")), String(fd.get("evidence")))); }}>
      <Select name="method" aria-label="Verification method">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      <Input name="evidence" required minLength={10} placeholder="Evidence (what was checked, links, who confirmed)" aria-label="Evidence" />
      <Button type="submit" size="sm" disabled={pending}>{t("admin.verify")}</Button>
      <div className="sm:col-span-3">{box}</div>
    </form>
  );
}

/** Revoke verification / suspend: requires a written reason. */
export function ReasonAction({ id, op, label, variant = "outline" }: { id: string; op: "revoke" | "suspend"; label: string; variant?: "outline" | "danger" }) {
  const { pending, run, box } = useAction();
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => organizerOpAction(id, op, String(fd.get("reason")))); }}>
      <Input name="reason" required minLength={5} placeholder="Reason" aria-label="Reason" className="min-h-9 w-48" />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>{label}</Button>
      {box}
    </form>
  );
}
