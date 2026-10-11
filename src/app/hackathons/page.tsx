import type { Metadata } from "next";
import { Explorer } from "@/components/events/explorer";
import { parseEventFilters } from "@/lib/events/filters";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("hackathons.title"), description: t("hackathons.description"), alternates: { canonical: "/hackathons" } };
}

export default async function HackathonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, sp] = await Promise.all([getT(), searchParams]);
  return <Explorer filters={{ ...parseEventFilters(sp), category: ["hackathons"] }} basePath="/hackathons" hide={["category"]} title={t("hackathons.title")} description={t("hackathons.description")} />;
}
