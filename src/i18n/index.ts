import { en, type Dictionary } from "./en";
import { my } from "./my";
import { translatorFrom, type Locale } from "./core";

export * from "./core";
export const dictionaries: Record<Locale, Dictionary> = { en, my };

export function createTranslator(locale: Locale) {
  return translatorFrom(dictionaries[locale], locale, en);
}
