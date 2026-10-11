"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmMfaSetupAction, deleteAccountAction, disableMfaAction, signOutEverywhereAction, startMfaSetupAction, verifyMfaAction } from "@/app/actions/security";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { useT } from "@/i18n/client";

export function MfaVerifyForm({ next }: { next?: string }) {
  const t = useT();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get("code")); setErr(null); start(async () => { const r = await verifyMfaAction(code, next); if (!r.ok) setErr(t(r.error ?? "common.error")); else { router.push(r.redirect ?? "/dashboard"); router.refresh(); } }); }}>
      {err && <Alert tone="error">{err}</Alert>}
      <Field label={t("mfa.codeLabel")} htmlFor="mfa-code" hint={t("mfa.recoveryHint")} required>
        <Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={32} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{t("mfa.verify")}</Button>
    </form>
  );
}

export function MfaSetup({ next }: { next?: string }) {
  const t = useT();
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (codes) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("mfa.enabled")}</Alert>
        <h2 className="font-semibold">{t("mfa.recoveryTitle")}</h2>
        <p className="text-sm text-muted">{t("mfa.recoveryNote")}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-[12px] border border-border bg-surface-2 p-4 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <Button className="w-full" onClick={() => { router.push(next ?? "/dashboard"); router.refresh(); }}>{t("mfa.done")}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {err && <Alert tone="error">{err}</Alert>}
      {!setup ? (
        <Button size="lg" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await startMfaSetupAction(); if (r.ok && r.data) setSetup(r.data); else setErr(t(r.error ?? "common.error")); })}>{t("mfa.begin")}</Button>
      ) : (
        <>
          <p className="text-sm text-muted">{t("mfa.scan")}</p>
          {/* QR is generated server-side as SVG from our own otpauth URI (no user-controlled markup) */}
          <div className="mx-auto w-48 rounded-[12px] bg-white p-2" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <p className="text-center text-xs text-muted">{t("mfa.manualKey")}: <code className="break-all font-mono text-fg">{setup.secret}</code></p>
          <form onSubmit={(e) => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get("code")); setErr(null); start(async () => { const r = await confirmMfaSetupAction(code); if (r.ok && r.data) setCodes(r.data.recoveryCodes); else setErr(t(r.error ?? "common.error")); }); }} className="space-y-4">
            <Field label={t("mfa.codeLabel")} htmlFor="mfa-confirm" required><Input id="mfa-confirm" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required /></Field>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>{t("mfa.confirm")}</Button>
          </form>
        </>
      )}
    </div>
  );
}

export function SecurityActions({ mfaEnabled, canDisableMfa }: { mfaEnabled: boolean; canDisableMfa: boolean }) {
  const t = useT();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-10">
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("securityPage.mfa")}</h2>
        <p className="text-sm text-muted">{mfaEnabled ? t("securityPage.mfaOn") : t("securityPage.mfaOff")}</p>
        {!mfaEnabled && <Button onClick={() => router.push("/auth/mfa/setup?next=/dashboard/security")}>{t("securityPage.enableMfa")}</Button>}
        {mfaEnabled && canDisableMfa && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const pw = String(new FormData(e.currentTarget).get("pw")); start(async () => { const r = await disableMfaAction(pw); setMsg({ ok: r.ok, text: t(r.ok ? "common.success" : (r.error ?? "common.error")) }); router.refresh(); }); }}>
            <Field label={t("common.password")} htmlFor="mfa-off-pw"><Input id="mfa-off-pw" name="pw" type="password" autoComplete="current-password" required /></Field>
            <Button type="submit" variant="outline" disabled={pending}>{t("securityPage.disableMfa")}</Button>
          </form>
        )}
        {mfaEnabled && !canDisableMfa && <p className="text-sm text-muted">{t("mfa.required")}</p>}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("securityPage.sessions")}</h2>
        <p className="text-sm text-muted">{t("securityPage.sessionsDesc")}</p>
        <form action={signOutEverywhereAction}><Button type="submit" variant="outline">{t("securityPage.signOutAll")}</Button></form>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("securityPage.data")}</h2>
        <p className="text-sm text-muted">{t("securityPage.dataDesc")}</p>
        <a href="/api/account/export" className="inline-flex min-h-11 items-center rounded-[10px] border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("securityPage.export")}</a>
      </section>
      <section className="space-y-3 rounded-[16px] border border-error/40 p-5">
        <h2 className="text-lg font-semibold text-error">{t("securityPage.deleteTitle")}</h2>
        <p className="text-sm text-muted">{t("securityPage.deleteWarn")}</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!window.confirm(t("securityPage.deleteConfirm"))) return; const pw = String(new FormData(e.currentTarget).get("pw")); start(async () => { const r = await deleteAccountAction(pw); if (r.ok) { router.push(r.redirect ?? "/"); router.refresh(); } else setMsg({ ok: false, text: t(r.error ?? "common.error") }); }); }}>
          <Field label={t("common.password")} htmlFor="del-pw"><Input id="del-pw" name="pw" type="password" autoComplete="current-password" required /></Field>
          <Button type="submit" variant="danger" disabled={pending}>{t("securityPage.deleteBtn")}</Button>
        </form>
      </section>
    </div>
  );
}
