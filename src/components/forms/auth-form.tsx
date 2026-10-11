"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotAction, loginAction, registerAction, registerOrganizerAction, resetAction } from "@/app/actions/auth";
import { Alert } from "@/components/ui/misc";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import { forgotSchema, loginSchema, registerOrganizerSchema, registerSchema, resetSchema } from "@/lib/validation/auth";

type Mode = "login" | "register" | "registerOrganizer" | "forgot" | "reset";
const schemas = { login: loginSchema, register: registerSchema, registerOrganizer: registerOrganizerSchema, forgot: forgotSchema, reset: resetSchema };

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const t = useT();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? undefined;
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schemas[mode] as never),
    defaultValues: { name: "", email: "", password: "", token: token ?? "", orgName: "", orgType: "UNIVERSITY_CLUB", orgDescription: "", orgEmail: "", orgWebsite: "", orgEvidence: "" },
  });
  const { register, handleSubmit, setError, formState: { errors } } = form;
  const err = (k: string) => (errors[k]?.message ? t(String(errors[k]?.message)) : undefined);

  const submit = handleSubmit((values) => {
    setBanner(null);
    start(async () => {
      const res =
        mode === "login" ? await loginAction(values, next)
        : mode === "register" ? await registerAction(values)
        : mode === "registerOrganizer" ? await registerOrganizerAction(values)
        : mode === "forgot" ? await forgotAction(values)
        : await resetAction({ ...values, token });
      if (res.fieldErrors) for (const [k, m] of Object.entries(res.fieldErrors)) setError(k, { message: m });
      if (res.error) setBanner({ tone: "error", text: t(res.error) });
      if (res.ok && res.message) setBanner({ tone: "success", text: t(res.message) });
      if (res.ok && res.redirect) router.push(res.redirect);
      if (res.ok) router.refresh();
    });
  });

  const isReg = mode === "register" || mode === "registerOrganizer";
  const labels = { login: t("auth.submitLogin"), register: t("auth.submitRegister"), registerOrganizer: t("auth.submitOrganizer"), forgot: t("auth.sendLink"), reset: t("auth.setPassword") };
  return (
    <form onSubmit={submit} noValidate className={mode === "registerOrganizer" ? "grid gap-x-10 gap-y-4 md:grid-cols-2" : "space-y-5"}>
      {banner && <Alert tone={banner.tone} className="md:col-span-2">{banner.text}</Alert>}
      <div className={mode === "registerOrganizer" ? "space-y-4" : "space-y-5"}>
        <p className={mode === "registerOrganizer" ? "text-sm font-semibold" : "hidden"}>{t("auth.yourAccount")}</p>
      {isReg && (
        <Field label={t("auth.fullName")} htmlFor="name" error={err("name")} required>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} {...register("name")} />
        </Field>
      )}
      {mode !== "reset" && (
        <Field label={t("common.email")} htmlFor="email" error={err("email")} required>
          <Input id="email" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
        </Field>
      )}
      {mode !== "forgot" && (
        <Field label={t("common.password")} htmlFor="password" error={err("password")} hint={mode !== "login" ? t("auth.passwordHint") : undefined} required>
          <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
        </Field>
      )}
      </div>
      {mode === "registerOrganizer" && (
        <fieldset className="space-y-4 border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-10">
          <legend className="mb-3 text-sm font-semibold">{t("auth.orgSection")}</legend>
          <Field label={t("submit.orgName")} htmlFor="orgName" error={err("orgName")} required><Input id="orgName" {...register("orgName")} /></Field>
          <Field label={t("submit.orgType")} htmlFor="orgType" error={err("orgType")} required>
            <Select id="orgType" {...register("orgType")}>{(["UNIVERSITY", "UNIVERSITY_CLUB", "TECH_COMMUNITY", "COMPANY", "NONPROFIT", "INDEPENDENT"] as const).map((v) => <option key={v} value={v}>{t(`organizers.types.${v}`)}</option>)}</Select>
          </Field>
          <Field label={t("submit.orgDesc")} htmlFor="orgDescription" error={err("orgDescription")} required><Textarea id="orgDescription" rows={2} {...register("orgDescription")} /></Field>
          <div className="grid gap-5 lg:grid-cols-2"><Field label={t("submit.orgEmail")} htmlFor="orgEmail" error={err("orgEmail")} required><Input id="orgEmail" type="email" {...register("orgEmail")} /></Field>
          <Field label={t("submit.orgWebsite")} htmlFor="orgWebsite" error={err("orgWebsite")}><Input id="orgWebsite" type="url" inputMode="url" {...register("orgWebsite")} /></Field></div>
          <Field label={t("submit.orgEvidence")} htmlFor="orgEvidence" error={err("orgEvidence")}><Input id="orgEvidence" type="url" inputMode="url" {...register("orgEvidence")} /></Field>
        </fieldset>
      )}
      {mode === "registerOrganizer" ? (
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 md:col-span-2">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t("common.loading") : labels[mode]}</Button>
        </div>
      ) : (
        <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t("common.loading") : labels[mode]}</Button>
      )}
      {mode === "login" && (
        <div className="flex flex-col gap-3 pt-1">
          <Link href="/auth/forgot-password" className="flex min-h-11 items-center justify-center rounded-[10px] text-sm font-medium underline underline-offset-4 hover:bg-fg/5">{t("auth.forgot")}</Link>
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-border bg-surface-2 p-4 text-center">
            <p className="text-sm text-muted">{t("auth.noAccount")}</p>
            <ButtonLink href="/auth/register" variant="outline" className="w-full">{t("nav.register")}</ButtonLink>
          </div>
        </div>
      )}
      {isReg && (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-border bg-surface-2 p-4 text-center">
          <p className="text-sm text-muted">{t("auth.haveAccount")}</p>
          <ButtonLink href="/auth/login" variant="outline" className="w-full">{t("nav.login")}</ButtonLink>
        </div>
      )}
    </form>
  );
}
