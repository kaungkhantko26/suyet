import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Explorer } from "@/components/events/explorer";
import { parseEventFilters } from "@/lib/events/filters";
import { getCategories } from "@/lib/events/lookups";
import { categoryName } from "@/lib/events/view";
import { getT } from "@/i18n/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [t, cats] = await Promise.all([getT(), getCategories()]);
  const c = cats.find((x) => x.slug === slug);
  if (!c) return {};
  return { title: t("events.categoryPage", { name: categoryName(c, t.locale) }), alternates: { canonical: `/categories/${slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, sp, t, cats] = await Promise.all([params, searchParams, getT(), getCategories()]);
  const c = cats.find((x) => x.slug === slug);
  if (!c) notFound();
  const filters = { ...parseEventFilters(sp), category: [slug] };
  return <Explorer filters={filters} basePath={`/categories/${slug}`} hide={["category"]} title={t("events.categoryPage", { name: categoryName(c, t.locale) })} description={t("events.description")} />;
}
