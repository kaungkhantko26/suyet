import type { Metadata } from "next";
import { Explorer } from "@/components/events/explorer";
import { parseEventFilters } from "@/lib/events/filters";
import { getT } from "@/i18n/server";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const t = await getT();
  const filtered = Object.keys(await searchParams).length > 0;
  return {
    title: t("events.title"),
    description: t("events.description"),
    alternates: { canonical: "/events" },
    // Filtered/sorted/paginated URLs are duplicates of /events; keep them out of the index.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function EventsPage({ searchParams }: { searchParams: SP }) {
  const [t, sp] = await Promise.all([getT(), searchParams]);
  return <Explorer filters={parseEventFilters(sp)} basePath="/events" title={t("events.title")} description={t("events.description")} />;
}
