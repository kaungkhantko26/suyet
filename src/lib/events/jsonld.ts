import { config } from "../config";
import { computeEventStatus } from "../event-status";
import { effectiveRegistrationUrl } from "./registration-helpers";
import type { getEventBySlug } from "./queries";

type Ev = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;

/**
 * schema.org/Event structured data. Returns null unless the minimum data
 * (name, startDate, a location or online URL) is genuinely available.
 */
export function eventJsonLd(e: Ev): Record<string, unknown> | null {
  const hasPlace = !!(e.venue || e.city || e.location);
  const online = e.format === "ONLINE" || e.format === "HYBRID";
  if (!hasPlace && !online) return null;
  const status = computeEventStatus({ ...e, registrationUrl: effectiveRegistrationUrl(e) });
  const place = hasPlace && e.format !== "ONLINE"
    ? { "@type": "Place", name: e.venue ?? e.city ?? e.location?.nameEn, address: { "@type": "PostalAddress", addressLocality: e.city ?? undefined, addressRegion: e.location?.nameEn, streetAddress: e.address ?? undefined, addressCountry: "MM" } }
    : null;
  const virtual = online ? { "@type": "VirtualLocation", url: e.onlineUrl ?? `${config.appUrl}/events/${e.slug}` } : null;
  const location = place && virtual ? [place, virtual] : (place ?? virtual);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.shortDescription,
    startDate: e.startAt.toISOString(),
    ...(e.endAt ? { endDate: e.endAt.toISOString() } : {}),
    eventStatus: status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: e.format === "ONLINE" ? "https://schema.org/OnlineEventAttendanceMode" : e.format === "HYBRID" ? "https://schema.org/MixedEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location,
    organizer: { "@type": "Organization", name: e.organizer.name, ...(e.organizer.website ? { url: e.organizer.website } : {}) },
    ...(e.bannerUrl ? { image: e.bannerUrl.startsWith("http") ? e.bannerUrl : `${config.appUrl}${e.bannerUrl}` } : {}),
    url: `${config.appUrl}/events/${e.slug}`,
    ...(effectiveRegistrationUrl(e) ? { offers: { "@type": "Offer", url: e.registrationMode === "ON_PLATFORM" ? `${config.appUrl}/events/${e.slug}/apply` : e.registrationUrl, price: String(e.feeAmount), priceCurrency: e.currency, ...(e.registrationDeadline ? { validThrough: e.registrationDeadline.toISOString() } : {}) } } : {}),
  };
}
