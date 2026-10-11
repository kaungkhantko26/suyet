import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Explorer } from "@/components/events/explorer";
import { parseEventFilters } from "@/lib/events/filters";
import { getLocations } from "@/lib/events/lookups";
import { locationName } from "@/lib/events/view";
import { getT } from "@/i18n/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [t, locs] = await Promise.all([getT(), getLocations()]);
  const l = locs.find((x) => x.slug === slug);
  if (!l) return {};
  return { title: t("events.locationPage", { name: locationName(l, t.locale)! }), alternates: { canonical: `/locations/${slug}` } };
}

export default async function LocationPage({ params, searchParams }: Props) {
  const [{ slug }, sp, t, locs] = await Promise.all([params, searchParams, getT(), getLocations()]);
  const l = locs.find((x) => x.slug === slug);
  if (!l) notFound();
  const filters = { ...parseEventFilters(sp), location: [slug] };
  return <Explorer filters={filters} basePath={`/locations/${slug}`} hide={["location"]} title={t("events.locationPage", { name: locationName(l, t.locale)! })} description={t("events.description")} />;
}
