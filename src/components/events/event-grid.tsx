import type { EventCardRow } from "@/lib/events/queries";
import type { Translator } from "@/i18n/core";
import { EventCard, EventCardSkeleton } from "./event-card";

export function EventGrid({ events, t, savedIds, authed }: { events: EventCardRow[]; t: Translator; savedIds: Set<string>; authed: boolean }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e, i) => (
        <li key={e.id}><EventCard event={e} t={t} saved={savedIds.has(e.id)} authed={authed} priority={i < 3} /></li>
      ))}
    </ul>
  );
}

export function EventGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, i) => <EventCardSkeleton key={i} />)}
    </div>
  );
}
