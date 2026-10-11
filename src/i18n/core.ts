import type { Dictionary } from "./en";

export type Locale = "en" | "my";
export const LOCALES: Locale[] = ["en", "my"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lte_locale";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "my";
}

export type Vars = Record<string, string | number>;

export interface Translator {
  (key: string, vars?: Vars): string;
  raw: <T = unknown>(key: string) => T;
  locale: Locale;
}

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
}

/** Dictionary-agnostic translator (safe to use in client bundles: imports no dictionaries). */
export function translatorFrom(dict: Dictionary, locale: Locale, fallback?: Dictionary): Translator {
  const t = ((key: string, vars?: Vars) => {
    let v = lookup(dict, key) ?? (fallback ? lookup(fallback, key) : undefined);
    if (typeof v !== "string") return key;
    if (vars) v = v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    return v as string;
  }) as Translator;
  t.raw = <T,>(key: string) => (lookup(dict, key) ?? (fallback ? lookup(fallback, key) : undefined)) as T;
  t.locale = locale;
  return t;
}
