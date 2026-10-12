import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarPlus, ExternalLink, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import { Countdown } from "@/components/events/countdown";
import { FallbackBanner } from "@/components/events/fallback-banner";
import { ReportDialog } from "@/components/events/report-dialog";
import { SaveButton } from "@/components/events/save-button";
import { ShareButton } from "@/components/events/share-button";
import { StatusBadge } from "@/components/events/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/misc";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { computeEventStatus, isRegistrationOpen } from "@/lib/event-status";
import { effectiveRegistrationUrl } from "@/lib/events/registration-helpers";
import { db } from "@/lib/db";
import { activeCount } from "@/lib/services/registrations";
import { eventJsonLd } from "@/lib/events/jsonld";
import { getEventBySlug } from "@/lib/events/queries";
import { getSavedIds } from "@/lib/events/lookups";
import { categoryName, formatFee, locationName, placeLabel } from "@/lib/events/view";
import { track } from "@/lib/services/misc";
import { isSafeExternalUrl } from "@/lib/url";
import { getT } from "@/i18n/server";

type Props = { params: Promise<{ slug: string }> };
type T = Awaited<ReturnType<typeof getT>>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEventBySlug(slug);
  if (!e) return { title: "Event not found", robots: { index: false } };
  const url = `/events/${e.slug}`;
  const images = e.bannerUrl ? [e.bannerUrl] : undefined;
  return {
    title: e.title,
    description: e.shortDescription,
    alternates: { canonical: url },
    openGraph: { type: "article", title: e.title, description: e.shortDescription, url, images },
    twitter: { card: images ? "summary_large_image" : "summary", title: e.title, description: e.shortDescription, images },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="mb-4 font-serif text-xl font-medium">{title}</h2>
      <div className="space-y-3 leading-relaxed whitespace-pre-line">{children}</div>
    </section>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

/**
 * The register CTA + quick actions + at-a-glance facts. Rendered twice: once inline right after the
 * header (mobile — so it's visible without scrolling past the whole description), once as the sticky
 * sidebar (desktop, where it's already always on screen). Same component, two placements.
 */
function RegisterCard({ e, t, locale, user, open, onPlatform, full, regForm, taken, statusInput, saved }: {
  e: NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>; t: T; locale: T["locale"]; user: { id: string } | null;
  open: boolean; onPlatform: boolean; full: boolean; regForm: { capacity: number | null; closesAt: Date | null } | null; taken: number;
  statusInput: { registrationUrl: string | null }; saved: boolean;
}) {
  return (
    <Card className="p-6">
      {open && onPlatform ? (
        <>
          <ButtonLink href={`/events/${e.slug}/apply`} size="lg" className="w-full" prefetch={false}>{t("registration.registerNow")}</ButtonLink>
          <p className="mt-2 text-xs text-muted">{t("registration.onSiteNote")}{regForm?.capacity != null && <> · {t("registration.spotsLeft", { left: Math.max(0, regForm.capacity - taken) })}</>}</p>
          {e.registrationDeadline && <p className="mt-3 text-sm font-medium"><Countdown target={e.registrationDeadline.toISOString()} /></p>}
        </>
      ) : open ? (
        <>
          <ButtonLink href={`/events/${e.slug}/register`} size="lg" className="w-full" rel="nofollow noopener" prefetch={false}>{t("details.registerCta")}<ExternalLink className="size-4" aria-hidden="true" /></ButtonLink>
          <p className="mt-2 text-xs text-muted">{t("details.registerWarning")}</p>
          {e.registrationDeadline && <p className="mt-3 text-sm font-medium"><Countdown target={e.registrationDeadline.toISOString()} /></p>}
        </>
      ) : (
        <Button size="lg" className="w-full" disabled>{full ? t("registration.full") : statusInput.registrationUrl ? t("details.registerClosed") : t("details.registerNone")}</Button>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <SaveButton eventId={e.id} saved={saved} authed={!!user} label className="col-span-2" />
        <ShareButton title={e.title} path={`/events/${e.slug}`} />
        <ButtonLink href={`/events/${e.slug}/calendar.ics`} variant="outline" prefetch={false}><CalendarPlus className="size-4" aria-hidden="true" />{t("details.addToCalendar")}</ButtonLink>
      </div>
      <dl className="mt-5 divide-y divide-border border-t border-border">
        <Row label={t("details.date")}>{formatDateTime(e.startAt, locale)}{e.endAt && <><br />→ {formatDateTime(e.endAt, locale)}</>}<span className="block text-xs font-normal text-muted">{t("common.mmt")}</span></Row>
        <Row label={t("details.deadline")}>{e.registrationDeadline ? formatDateTime(e.registrationDeadline, locale) : t("common.unknown")}</Row>
        <Row label={t("details.location")}>{placeLabel(e, locale, t)}{e.location && e.format !== "ONLINE" && !placeLabel(e, locale, t).includes(locationName(e.location, locale)!) ? `, ${locationName(e.location, locale)}` : ""}</Row>
        <Row label={t("details.format")}>{t(`format.${e.format}`)}</Row>
        <Row label={t("details.fee")}>{formatFee(e.feeAmount, e.currency, t)}</Row>
        <Row label={t("details.eligibility")}>{e.eligibility ?? t("events.eligOpen")}</Row>
        <Row label={t("details.teamSize")}>{e.teamAllowed && e.maxTeamSize ? t("details.teamRange", { min: e.minTeamSize ?? 1, max: e.maxTeamSize }) : t("details.solo")}</Row>
      </dl>
    </Card>
  );
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const [t, user, e] = await Promise.all([getT(), getCurrentUser(), getEventBySlug(slug)]);
  if (!e) notFound();
  const locale = t.locale;
  const [savedIds] = await Promise.all([getSavedIds(user?.id), track("PAGE_VIEW", { eventId: e.id })]);
  const onPlatform = e.registrationMode === "ON_PLATFORM";
  const regForm = onPlatform ? await db.registrationForm.findUnique({ where: { eventId: e.id }, select: { enabled: true, capacity: true, closesAt: true } }) : null;
  const taken = regForm?.capacity != null ? await activeCount(e.id) : 0;
  const statusInput = { ...e, registrationUrl: effectiveRegistrationUrl({ ...e, registrationForm: regForm }) };
  const status = computeEventStatus(statusInput);
  const full = regForm?.capacity != null && taken >= regForm.capacity;
  const open = isRegistrationOpen(statusInput) && !full && (!regForm?.closesAt || new Date() < regForm.closesAt);
  const primary = e.categories[0]?.category;
  const schedule = Array.isArray(e.schedule) ? (e.schedule as { time: string; title: string }[]) : [];
  const jsonLd = eventJsonLd(e);
  const sourceHost = e.sourceUrl && isSafeExternalUrl(e.sourceUrl) ? new URL(e.sourceUrl).hostname : null;
  const cardProps = { e, t, locale, user, open, onPlatform, full, regForm, taken, statusInput, saved: savedIds.has(e.id) };
  const mapQuery = e.address || (e.location ? locationName(e.location, locale) : null);

  return (
    <article>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Container className="pt-6">
        <div className="relative mt-4 aspect-[21/9] w-full overflow-hidden rounded-[16px] border border-border">
          {e.bannerUrl ? <Image src={e.bannerUrl} alt="" fill priority sizes="(min-width:1280px) 1216px, 100vw" className="object-cover" /> : <FallbackBanner slug={primary?.slug ?? "event"} icon={primary?.icon ?? "sparkles"} />}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <Link href="/events" aria-label={t("details.breadcrumbEvents")} className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-bg/70 text-fg backdrop-blur hover:bg-bg/90">
              <ArrowLeft className="size-[18px]" aria-hidden="true" />
            </Link>
            <SaveButton eventId={e.id} saved={savedIds.has(e.id)} authed={!!user} className="size-10! rounded-full border border-white/20 bg-bg/70 backdrop-blur hover:bg-bg/90" />
          </div>
        </div>
      </Container>

      <Container className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {e.categories.map((c) => <Link key={c.categoryId} href={`/categories/${c.category.slug}`}><Badge tone="outline">{categoryName(c.category, locale)}</Badge></Link>)}
              <StatusBadge status={status} t={t} />
              {e.isDemo && <Badge tone="warning">{t("common.demoBadge")}</Badge>}
            </div>
            <h1 className="mt-4 font-serif text-3xl leading-tight font-medium tracking-tight sm:text-5xl">{e.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-muted">
              <Link href={`/organizers/${e.organizer.slug}`} className="font-medium text-fg underline-offset-4 hover:underline">{e.organizer.name}</Link>
              {e.organizer.status === "VERIFIED" && <BadgeCheck className="size-4 text-primary" aria-label={t("verification.organizerVerified")} />}
            </p>
            <p className="mt-2 text-sm text-muted">{formatDateTime(e.startAt, locale)}{e.endAt && ` – ${formatDateTime(e.endAt, locale)}`}</p>
            {onPlatform && taken > 0 && <p className="mt-1 text-sm text-muted">{t("registration.registeredCount", { count: taken })}</p>}
            <p className="mt-5 text-lg text-muted">{e.shortDescription}</p>
          </header>

          {/* Mobile only: the register CTA right under the header, not after the whole description. */}
          <div className="lg:hidden"><RegisterCard {...cardProps} /></div>

          {(e.address || e.onlineUrl || mapQuery) && (
            <Section title={t("details.locationFormat")}>
              <Card className="space-y-3 p-5">
                <p className="flex items-start gap-2 font-medium"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />{t(`format.${e.format}`)} · {placeLabel(e, locale, t)}</p>
                {e.address && <p className="text-sm text-muted">{e.address}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {mapQuery && e.format !== "ONLINE" && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
                      <MapPin className="size-3.5" aria-hidden="true" />{t("details.openInMaps")}
                    </a>
                  )}
                  {e.onlineUrl && isSafeExternalUrl(e.onlineUrl) && e.format !== "ONSITE" && (
                    <a href={e.onlineUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">{t("details.onlineLink")}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
                  )}
                </div>
              </Card>
            </Section>
          )}

          <Section title={t("details.organizerInfo")}>
            <Card className="p-5">
              <p className="font-semibold">{e.organizer.name}</p>
              {e.organizer.description && <p className="mt-1 text-sm text-muted">{e.organizer.description}</p>}
              <p className="mt-3 text-sm">{e.organizer.status === "VERIFIED" ? <span className="inline-flex items-center gap-1 text-success"><ShieldCheck className="size-4" aria-hidden="true" />{t("verification.organizerVerified")}</span> : <span className="text-muted">{t("verification.organizerUnverified")}</span>}</p>
              <Link href={`/organizers/${e.organizer.slug}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t("details.organizerProfile")}</Link>
            </Card>
            {e.contactInfo && <p className="text-sm"><span className="text-muted">{t("details.contact")}: </span>{e.contactInfo}</p>}
          </Section>

          <Section title={t("details.about")}>{e.description}</Section>
          <Section title={t("details.who")}>
            <p>{e.eligibility ?? t("events.eligOpen")}</p>
            <p className="text-muted">{t(`skill.${e.skillLevel}`)}</p>
          </Section>
          {schedule.length > 0 && (
            <Section title={t("details.schedule")}>
              <ol className="divide-y divide-border rounded-[12px] border border-border bg-surface">
                {schedule.map((s, i) => (
                  <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-4 px-4 py-3 text-sm"><span className="font-medium tabular-nums">{s.time}</span><span>{s.title}</span></li>
                ))}
              </ol>
            </Section>
          )}
          {e.requirements && <Section title={t("details.requirements")}>{e.requirements}</Section>}
          {e.prizes && <Section title={t("details.prizes")}>{e.prizes}</Section>}
          <Section title={t("details.sources")}>
            <Card className="space-y-3 p-5 text-sm whitespace-normal">
              <p className="flex items-start gap-2">
                {e.verificationStatus === "VERIFIED" ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                <span><strong>{t(`verification.${e.verificationStatus}`)}</strong> · {t("verification.lastVerified")}: {e.lastVerifiedAt ? formatDate(e.lastVerifiedAt, locale) : t("verification.never")}</span>
              </p>
              {sourceHost ? (
                <p>{t("details.sourceUrl")}: <a href={e.sourceUrl!} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium underline underline-offset-4">{sourceHost}</a></p>
              ) : <p className="text-muted">{t("common.unknown")}</p>}
              <p className="text-muted">{t("verification.note")}</p>
            </Card>
          </Section>
          <ReportDialog eventId={e.id} />
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start" aria-label={t("details.sidebar")}>
          <RegisterCard {...cardProps} />
        </aside>
      </Container>
    </article>
  );
}
