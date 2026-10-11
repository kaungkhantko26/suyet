import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createTranslator, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** English unless the visitor explicitly chose Burmese (persisted in a cookie). */
export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
});

export async function getT() {
  return createTranslator(await getLocale());
}
