import type { EventCardRow } from "./queries";
import type { Locale } from "@/lib/dates";
import type { Translator } from "@/i18n/core";

export const categoryName = (c: { nameEn: string; nameMy: string }, l: Locale) => (l === "my" ? c.nameMy : c.nameEn);
export const locationName = (loc: { nameEn: string; nameMy: string } | null | undefined, l: Locale) => (loc ? (l === "my" ? loc.nameMy : loc.nameEn) : null);

export function formatFee(amount: number, currency: string, t: Translator) {
  if (amount <= 0) return t("common.free");
  return `${new Intl.NumberFormat("en-US").format(amount)} ${currency}`;
}

/** Human-readable place line: venue/city + region, or Online. Never invents a place. */
export function placeLabel(
  e: Pick<EventCardRow, "format" | "city" | "venue" | "location">,
  l: Locale,
  t: Translator,
): string {
  if (e.format === "ONLINE") return t("format.ONLINE");
  const parts = [e.venue, e.city, locationName(e.location, l)].filter(Boolean) as string[];
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  const place = unique.join(", ") || t("common.unknown");
  return e.format === "HYBRID" ? `${place} · ${t("format.HYBRID")}` : place;
}
