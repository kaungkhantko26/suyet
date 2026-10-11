"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveEventAction } from "@/app/actions/organizer";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import { eventFormSchema } from "@/lib/validation/event";

export interface FormOption { value: string; label: string }
export interface EventFormValues {
  title: string; slug: string; shortDescription: string; description: string; categoryIds: string[];
  startAt: string; endAt: string; registrationDeadline: string; format: string; country: string; locationId: string;
  city: string; venue: string; address: string; onlineUrl: string; registrationMode: string; registrationUrl: string; sourceUrl: string;
  eligibility: string; skillLevel: string; requirements: string; feeAmount: string; currency: string;
  teamAllowed: boolean; minTeamSize: string; maxTeamSize: string; prizes: string; scheduleText: string; contactInfo: string;
}

export const emptyEventValues: EventFormValues = {
  title: "", slug: "", shortDescription: "", description: "", categoryIds: [], startAt: "", endAt: "", registrationDeadline: "",
  format: "ONSITE", country: "Myanmar", locationId: "", city: "", venue: "", address: "", onlineUrl: "", registrationMode: "EXTERNAL", registrationUrl: "", sourceUrl: "",
  eligibility: "", skillLevel: "ALL_LEVELS", requirements: "", feeAmount: "0", currency: "MMK", teamAllowed: false, minTeamSize: "", maxTeamSize: "",
  prizes: "", scheduleText: "", contactInfo: "",
};

interface Props {
  categories: FormOption[];
  locations: FormOption[];
  organizers?: FormOption[];
  eventId?: string;
  defaults?: EventFormValues;
  currentBanner?: string | null;
  published?: boolean;
  isAdmin?: boolean;
}

export function EventForm({ categories, locations, organizers, eventId, defaults = emptyEventValues, currentBanner, published, isAdmin }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [organizerId, setOrganizerId] = useState(organizers?.[0]?.value ?? "");
  const { register, handleSubmit, getValues, setError, watch, setValue, formState: { errors } } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema) as never,
    defaultValues: defaults,
  });
  const err = (k: keyof EventFormValues) => (errors[k]?.message ? t(String(errors[k]?.message)) : undefined);
  const cats = watch("categoryIds");
  const teamAllowed = watch("teamAllowed");
  const format = watch("format");
  const regMode = watch("registrationMode");

  const send = (intent: "draft" | "submit") =>
    handleSubmit(() => {
      setBanner(null);
      const fd = new FormData();
      fd.set("data", JSON.stringify(getValues()));
      fd.set("intent", intent);
      if (eventId) fd.set("eventId", eventId);
      else fd.set("organizerId", organizerId);
      if (file) fd.set("banner", file);
      start(async () => {
        const r = await saveEventAction(fd);
        if (r.fieldErrors) for (const [k, m] of Object.entries(r.fieldErrors)) setError(k as keyof EventFormValues, { message: m });
        if (r.error) setBanner({ tone: "error", text: t(r.error) });
        if (r.ok) {
          setBanner({ tone: "success", text: t(r.message ?? "form.saved") });
          router.push(r.redirect ?? "/organizer/events");
          router.refresh();
        }
      });
    });

  const f = (name: keyof EventFormValues, label: string, opts: { required?: boolean; type?: string; hint?: string; inputMode?: "numeric" | "url" } = {}) => (
    <Field label={label} htmlFor={name} error={err(name)} hint={opts.hint} required={opts.required}>
      <Input id={name} type={opts.type ?? "text"} inputMode={opts.inputMode} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} {...register(name as never)} />
    </Field>
  );

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-10">
      {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
      {published && !isAdmin && <Alert tone="info">{t("form.reviewNote")}</Alert>}

      {organizers && organizers.length > 1 && !eventId && (
        <Field label={t("events.organizer")} htmlFor="organizerId">
          <Select id="organizerId" value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>{organizers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        </Field>
      )}

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-medium">01 — {t("details.about")}</h2>
        {f("title", t("form.eventTitle"), { required: true })}
        {f("slug", t("form.slug"), { hint: "my-event-name" })}
        <Field label={t("form.short")} htmlFor="shortDescription" error={err("shortDescription")} required>
          <Textarea id="shortDescription" rows={2} maxLength={300} aria-invalid={!!errors.shortDescription} {...register("shortDescription")} />
        </Field>
        <Field label={t("form.full")} htmlFor="description" error={err("description")} required>
          <Textarea id="description" rows={8} aria-invalid={!!errors.description} {...register("description")} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t("form.categories")} <span className="text-error" aria-hidden="true">*</span></legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {categories.map((c) => (
              <Checkbox key={c.value} label={c.label} checked={cats.includes(c.value)} onChange={(e) => setValue("categoryIds", e.target.checked ? [...cats, c.value] : cats.filter((x) => x !== c.value), { shouldValidate: true })} />
            ))}
          </div>
          {errors.categoryIds && <p role="alert" className="text-xs font-medium text-error">{t(String(errors.categoryIds.message))}</p>}
        </fieldset>
        <Field label={t("form.banner")} htmlFor="banner" hint={fileError ?? t("form.bannerHint")} error={fileError ?? undefined}>
          <input id="banner" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-surface file:px-4"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              if (picked && picked.size > 4 * 1024 * 1024) { setFileError(t("validation.image")); setFile(null); e.target.value = ""; return; }
              setFileError(null); setFile(picked);
            }} />
          {currentBanner && !file && <p className="mt-1 text-xs text-muted">{currentBanner}</p>}
        </Field>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-medium">02 — {t("details.date")}</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {f("startAt", t("form.start"), { required: true, type: "datetime-local" })}
          {f("endAt", t("form.end"), { type: "datetime-local" })}
          {f("registrationDeadline", t("form.deadline"), { type: "datetime-local" })}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-medium">03 — {t("details.locationFormat")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("form.format")} htmlFor="format" error={err("format")} required>
            <Select id="format" {...register("format")}>{(["ONSITE", "ONLINE", "HYBRID"] as const).map((v) => <option key={v} value={v}>{t(`format.${v}`)}</option>)}</Select>
          </Field>
          {f("country", t("form.country"))}
          <Field label={t("form.region")} htmlFor="locationId" error={err("locationId")}>
            <Select id="locationId" {...register("locationId")}><option value="">—</option>{locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</Select>
          </Field>
          {format !== "ONLINE" && f("city", t("form.city"))}
          {format !== "ONLINE" && f("venue", t("form.venue"))}
          {format !== "ONLINE" && f("address", t("form.address"))}
          {format !== "ONSITE" && f("onlineUrl", t("form.onlineUrl"), { type: "url", inputMode: "url", required: format === "ONLINE" })}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-medium">04 — {t("details.sources")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("registration.mode")} htmlFor="registrationMode" hint={regMode === "ON_PLATFORM" ? t("registration.modeHintOnPlatform") : undefined} className="sm:col-span-2">
            <Select id="registrationMode" {...register("registrationMode")}>
              <option value="EXTERNAL">{t("registration.modeExternal")}</option>
              <option value="ON_PLATFORM">{t("registration.modeOnPlatform")}</option>
            </Select>
          </Field>
          {regMode !== "ON_PLATFORM" && f("registrationUrl", t("form.registrationUrl"), { type: "url", inputMode: "url" })}
          {f("sourceUrl", t("form.sourceUrl"), { type: "url", inputMode: "url" })}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-medium">05 — {t("details.who")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {f("eligibility", t("form.eligibility"))}
          <Field label={t("form.skill")} htmlFor="skillLevel"><Select id="skillLevel" {...register("skillLevel")}>{(["ALL_LEVELS", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const).map((v) => <option key={v} value={v}>{t(`skill.${v}`)}</option>)}</Select></Field>
          {f("feeAmount", t("form.fee"), { type: "number", inputMode: "numeric" })}
          {f("currency", t("form.currency"))}
        </div>
        <Checkbox label={t("form.team")} {...register("teamAllowed")} />
        {teamAllowed && <div className="grid gap-5 sm:grid-cols-2">{f("minTeamSize", t("form.minTeam"), { type: "number", inputMode: "numeric" })}{f("maxTeamSize", t("form.maxTeam"), { type: "number", inputMode: "numeric" })}</div>}
        <Field label={t("form.requirements")} htmlFor="requirements"><Textarea id="requirements" rows={3} {...register("requirements")} /></Field>
        <Field label={t("form.prizes")} htmlFor="prizes"><Textarea id="prizes" rows={3} {...register("prizes")} /></Field>
        <Field label={t("form.schedule")} htmlFor="scheduleText" hint={t("form.scheduleHint")}><Textarea id="scheduleText" rows={5} {...register("scheduleText")} /></Field>
        {f("contactInfo", t("form.contact"))}
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-border bg-bg/95 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="button" variant="outline" disabled={pending} onClick={send("draft")}>{t("form.saveDraft")}</Button>
        {!published && <Button type="button" disabled={pending} onClick={send("submit")}>{pending ? t("common.loading") : t("form.submitReview")}</Button>}
      </div>
    </form>
  );
}
