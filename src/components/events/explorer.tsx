import { SearchX } from "lucide-react";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { countActiveFilters, filtersToSearchParams, type EventFilters as Filters } from "@/lib/events/filters";
import { getCategories, getLocations, getOrganizerOptions, getSavedIds } from "@/lib/events/lookups";
import { listEvents } from "@/lib/events/queries";
import { categoryName, locationName } from "@/lib/events/view";
import { track } from "@/lib/services/misc";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getT } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";
import { EventGrid, EventGridSkeleton } from "./event-grid";
import { FiltersPanel } from "./filters-panel";
import { SearchAutocomplete } from "./search-autocomplete";
import { Pagination } from "./pagination";
import { SortSelect } from "./sort-select";

async function Results({ filters, basePath }: { filters: Filters; basePath: string }) {
  const [t, user] = await Promise.all([getT(), getCurrentUser()]);
  // Public search: 60 searches per IP per minute (full-text queries are the expensive path).
  if (filters.q && !(await rateLimit(`search:${clientIp(await headers())}`, 60, 60)).allowed) {
    return <EmptyState title={t("auth.tooMany")} />;
  }
  const [{ items, total, pages }, savedIds] = await Promise.all([listEvents(filters), getSavedIds(user?.id)]);
  if (filters.q && filters.page === 1) await track("SEARCH", { query: filters.q });
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-10" aria-hidden="true" />}
        title={t("common.noResults")}
        body={t("common.tryAdjusting")}
        action={<ButtonLink href={basePath} variant="outline">{t("common.resetFilters")}</ButtonLink>}
      />
    );
  }
  const params = filtersToSearchParams(filters);
  return (
    <>
      <p className="mb-4 text-sm text-muted" aria-live="polite">{t("common.resultsCount", { count: total })}</p>
      <EventGrid events={items} t={t} savedIds={savedIds} authed={!!user} />
      <Pagination page={filters.page} pages={pages} basePath={basePath} params={params} t={t} />
    </>
  );
}

/** Shared by /events, /categories/[slug], /locations/[slug] and /hackathons. */
export async function Explorer({ filters, basePath, hide, title, description }: { filters: Filters; basePath: string; hide?: ("category" | "location")[]; title: string; description: string }) {
  const [t, categories, locations, organizers] = await Promise.all([getT(), getCategories(), getLocations(), getOrganizerOptions()]);
  const locale = t.locale;
  const key = filtersToSearchParams(filters).toString();
  return (
    <Container className="py-10 sm:py-14">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-muted">{description}</p>
      </header>
      <form action={basePath} role="search" className="mb-6 flex gap-2">
        <SearchAutocomplete id="q" defaultValue={filters.q ?? ""} placeholder={t("events.searchPlaceholder")} className="flex-1" />
        {/* keep other filters when searching */}
        {[...filtersToSearchParams({ ...filters, q: undefined, page: 1 }).entries()].map(([k, v], i) => <input key={i} type="hidden" name={k} value={v} />)}
        <button type="submit" className="min-h-12 cursor-pointer rounded-[10px] bg-primary px-6 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("common.search")}</button>
      </form>
      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        <FiltersPanel
          hide={hide}
          activeCount={countActiveFilters(filters) - (filters.q ? 1 : 0)}
          categories={categories.map((c) => ({ value: c.slug, label: categoryName(c, locale) }))}
          locations={locations.map((l) => ({ value: l.slug, label: locationName(l, locale)! }))}
          organizers={organizers.map((o) => ({ value: o.slug, label: o.name }))}
        />
        <section aria-label={title}>
          <div className="mb-4 flex justify-end"><SortSelect value={filters.sort} /></div>
          <Suspense key={key} fallback={<EventGridSkeleton />}>
            <Results filters={filters} basePath={basePath} />
          </Suspense>
        </section>
      </div>
    </Container>
  );
}
