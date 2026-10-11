"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Dictionary } from "./en";
import { translatorFrom, type Locale, type Translator } from "./core";

const Ctx = createContext<Translator | null>(null);

export function I18nProvider({ dict, locale, children }: { dict: Dictionary; locale: Locale; children: ReactNode }) {
  const t = useMemo(() => translatorFrom(dict, locale), [dict, locale]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useT(): Translator {
  const t = useContext(Ctx);
  if (!t) throw new Error("useT must be used inside I18nProvider");
  return t;
}
