import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, CalendarDays, MapPin, Hourglass, Users } from "lucide-react";
import type { EventCardRow } from "@/lib/events/queries";
import { categoryName, formatFee, placeLabel } from "@/lib/events/view";
import { computeEventStatus } from "@/lib/event-status";
import { effectiveRegistrationUrl } from "@/lib/events/registration-helpers";
import { formatDate } from "@/lib/dates";
import type { Translator } from "@/i18n/core";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import { FallbackBanner } from "./fallback-banner";
import { SaveButton } from "./save-button";
import { Countdown } from "./countdown";

export function EventCard({ event, t, saved = false, authed = false, priority = false }: { event: EventCardRow; t: Translator; saved?: boolean; authed?: boolean; priority?: boolean }) {
  const locale = t.locale;
  const status = computeEventStatus({ ...event, registrationUrl: effectiveRegistrationUrl(event) });
  const primary = event.categories[0]?.category;
  const showDeadline = event.registrationDeadline && status === "REGISTRATION_OPEN";
  const meta = "flex items-start gap-2 text-[13px] text-muted";
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-raised) motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-border bg-surface-2">
        {event.bannerUrl ? (
          <Image src={event.bannerUrl} alt="" fill sizes="(min-width:1024px) 400px, (min-width:768px) 50vw, 100vw" className="object-cover" priority={priority} />
        ) : (
          <FallbackBanner slug={primary?.slug ?? "event"} icon={primary?.icon ?? "sparkles"} />
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <StatusBadge status={status} t={t} />
          {event.isDemo && <Badge tone="warning">{t("common.demoBadge")}</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">{primary ? categoryName(primary, locale) : ""}</p>
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.75rem] text-[17px] leading-snug font-semibold">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[16px]">{event.title}</Link>
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <span className="truncate">{event.organizer.name}</span>
          {event.organizer.status === "VERIFIED" && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t("verification.organizerVerified")} />}
        </p>
        <ul className="mt-4 space-y-1.5">
          <li className={meta}><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{formatDate(event.startAt, locale)}</span></li>
          <li className={meta}><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="line-clamp-1">{placeLabel(event, locale, t)}</span></li>
          {event.teamAllowed && event.maxTeamSize ? <li className={meta}><Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{t("details.teamRange", { min: event.minTeamSize ?? 1, max: event.maxTeamSize })}</span></li> : null}
          <li className={meta}>
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {event.registrationDeadline
                ? <>{t("details.deadline")}: {formatDate(event.registrationDeadline, locale)}{showDeadline && <> · <Countdown target={event.registrationDeadline.toISOString()} className="font-medium text-fg" /></>}</>
                : t("common.unknown")}
            </span>
          </li>
        </ul>
        <div className="mt-auto flex items-center justify-between gap-2 pt-5">
          <div className="flex items-center gap-1.5">
            <Badge tone={event.feeAmount > 0 ? "outline" : "success"}>{formatFee(event.feeAmount, event.currency, t)}</Badge>
            <Badge tone="outline">{t(`format.${event.format}`)}</Badge>
          </div>
          <div className="relative z-10 -mr-2"><SaveButton eventId={event.id} saved={saved} authed={authed} /></div>
        </div>
      </div>
    </Card>
  );
}

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden" aria-hidden="true">
      <div className="skeleton aspect-[16/9] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-5 w-4/5" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton mt-4 h-4 w-3/5" />
        <div className="skeleton h-4 w-2/3" />
      </div>
    </Card>
  );
}
