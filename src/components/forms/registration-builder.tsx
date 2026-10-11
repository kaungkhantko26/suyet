"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveRegistrationFormAction } from "@/app/actions/registration";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import { CHOICE_TYPES, FIELD_TYPES, type FieldType } from "@/lib/registration/schema";

export interface BuilderField { key: string; id?: string; type: FieldType; label: string; helpText: string; required: boolean; optionsText: string; maxLength: string }
export interface BuilderInitial { enabled: boolean; requireApproval: boolean; description: string; confirmationMessage: string; capacity: string; closesAt: string; fields: Omit<BuilderField, "key">[] }

let counter = 0;
const newKey = () => `k${++counter}-${Math.random().toString(36).slice(2, 7)}`;

export function RegistrationBuilder({ eventId, initial }: { eventId: string; initial: BuilderInitial }) {
  const t = useT();
  const [settings, setSettings] = useState({ enabled: initial.enabled, requireApproval: initial.requireApproval, description: initial.description, confirmationMessage: initial.confirmationMessage, capacity: initial.capacity, closesAt: initial.closesAt });
  const [fields, setFields] = useState<BuilderField[]>(() => initial.fields.map((f) => ({ ...f, key: newKey() })));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const patch = (key: string, p: Partial<BuilderField>) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => setFields((fs) => { const j = i + d; if (j < 0 || j >= fs.length) return fs; const c = [...fs]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const save = () => {
    setMsg(null); setErrs({});
    const payload = {
      enabled: settings.enabled, requireApproval: settings.requireApproval, description: settings.description, confirmationMessage: settings.confirmationMessage,
      capacity: settings.capacity ? Number(settings.capacity) : null, closesAt: settings.closesAt || null,
      fields: fields.map((f) => ({
        id: f.id, type: f.type, label: f.label, helpText: f.helpText, required: f.required,
        options: CHOICE_TYPES.includes(f.type) ? f.optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : null,
        rules: f.maxLength && (f.type === "SHORT_TEXT" || f.type === "LONG_TEXT") ? { maxLength: Number(f.maxLength) } : null,
      })),
    };
    start(async () => {
      const r = await saveRegistrationFormAction(eventId, payload);
      if (r.fieldErrors) setErrs(r.fieldErrors);
      setMsg({ ok: r.ok, text: t(r.ok ? (r.message ?? "form.saved") : (r.error ?? "common.error")) });
    });
  };
  const fe = (i: number, k: string) => (errs[`fields.${i}.${k}`] ? t(errs[`fields.${i}.${k}`]) : undefined);

  return (
    <div className="space-y-8">
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Card className="space-y-5 p-5">
        <Checkbox label={t("registration.enabled")} checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
        <div>
          <Checkbox label={t("registration.requireApproval")} checked={settings.requireApproval} onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })} />
          <p className="ml-8 text-xs text-muted">{settings.requireApproval ? t("registration.requireApprovalOn") : t("registration.requireApprovalOff")}</p>
        </div>
        <Field label={t("registration.description")} htmlFor="rf-desc"><Textarea id="rf-desc" rows={3} maxLength={2000} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("registration.capacity")} htmlFor="rf-cap" hint={t("registration.capacityHint")}><Input id="rf-cap" type="number" inputMode="numeric" min={1} value={settings.capacity} onChange={(e) => setSettings({ ...settings, capacity: e.target.value })} /></Field>
          <Field label={t("registration.closesAt")} htmlFor="rf-close" hint={t("registration.closesAtHint")}><Input id="rf-close" type="datetime-local" value={settings.closesAt} onChange={(e) => setSettings({ ...settings, closesAt: e.target.value })} /></Field>
        </div>
        <Field label={t("registration.confirmation")} htmlFor="rf-conf"><Textarea id="rf-conf" rows={2} maxLength={1000} value={settings.confirmationMessage} onChange={(e) => setSettings({ ...settings, confirmationMessage: e.target.value })} /></Field>
      </Card>

      <Alert tone="info">{t("registration.collectNote")}</Alert>

      <ol className="space-y-4">
        {fields.map((f, i) => (
          <li key={f.key}>
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={t("registration.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden="true" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("registration.moveDown")} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden="true" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("registration.remove")} onClick={() => setFields((fs) => fs.filter((x) => x.key !== f.key))}><Trash2 className="size-4 text-error" aria-hidden="true" /></Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
                <Field label={t("registration.question")} htmlFor={`q-${f.key}`} error={fe(i, "label")} required><Input id={`q-${f.key}`} value={f.label} maxLength={200} onChange={(e) => patch(f.key, { label: e.target.value })} /></Field>
                <Field label={t("registration.type")} htmlFor={`t-${f.key}`}>
                  <Select id={`t-${f.key}`} value={f.type} onChange={(e) => patch(f.key, { type: e.target.value as FieldType })}>{FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(`registration.types.${ty}`)}</option>)}</Select>
                </Field>
              </div>
              <Field label={t("registration.helpText")} htmlFor={`h-${f.key}`}><Input id={`h-${f.key}`} value={f.helpText} maxLength={500} onChange={(e) => patch(f.key, { helpText: e.target.value })} /></Field>
              {CHOICE_TYPES.includes(f.type) && (
                <Field label={t("registration.options")} htmlFor={`o-${f.key}`} hint={t("registration.optionsHint")} error={fe(i, "options")}><Textarea id={`o-${f.key}`} rows={4} value={f.optionsText} onChange={(e) => patch(f.key, { optionsText: e.target.value })} /></Field>
              )}
              {(f.type === "SHORT_TEXT" || f.type === "LONG_TEXT") && (
                <Field label={t("registration.maxLength")} htmlFor={`m-${f.key}`}><Input id={`m-${f.key}`} type="number" inputMode="numeric" min={1} max={5000} value={f.maxLength} onChange={(e) => patch(f.key, { maxLength: e.target.value })} className="max-w-40" /></Field>
              )}
              <Checkbox label={t("registration.required")} checked={f.required} onChange={(e) => patch(f.key, { required: e.target.checked })} />
              {fe(i, "label") && null}
            </Card>
          </li>
        ))}
      </ol>
      {fields.length === 0 && <p className="text-sm text-muted">{t("registration.noQuestions")}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={fields.length >= 30} onClick={() => setFields((fs) => [...fs, { key: newKey(), type: "SHORT_TEXT", label: "", helpText: "", required: false, optionsText: "", maxLength: "" }])}><Plus className="size-4" aria-hidden="true" />{t("registration.addQuestion")}</Button>
        <Button onClick={save} disabled={pending}>{pending ? t("common.loading") : t("common.save")}</Button>
      </div>
    </div>
  );
}
