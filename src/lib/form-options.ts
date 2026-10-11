import "server-only";
import { getCategories, getLocations } from "./events/lookups";
import { categoryName, locationName } from "./events/view";
import type { Locale } from "./dates";

export async function formOptions(locale: Locale) {
  const [cats, locs] = await Promise.all([getCategories(), getLocations()]);
  return {
    categories: cats.map((c) => ({ value: c.id, label: categoryName(c, locale) })),
    locations: locs.map((l) => ({ value: l.id, label: locationName(l, locale)! })),
  };
}
