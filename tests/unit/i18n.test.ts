import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { my } from "@/i18n/my";
import { createTranslator } from "@/i18n";

function flatten(o: unknown, p = ""): Record<string, unknown> {
  if (typeof o === "string" || Array.isArray(o)) return { [p]: o };
  return Object.entries(o as object).reduce((a, [k, v]) => ({ ...a, ...flatten(v, p ? `${p}.${k}` : k) }), {});
}
const E = flatten(en), M = flatten(my);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Burmese localization", () => {
  it("has exactly the same keys as English", () => {
    expect(Object.keys(M).sort()).toEqual(Object.keys(E).sort());
  });
  it("keeps interpolation placeholders intact", () => {
    for (const [k, v] of Object.entries(E)) if (typeof v === "string") expect(placeholders(M[k] as string), k).toEqual(placeholders(v));
  });
  it("has no empty strings", () => {
    for (const [k, v] of Object.entries(M)) if (typeof v === "string") expect(v.trim().length, k).toBeGreaterThan(0);
  });
  it("uses Myanmar Unicode (not Zawgyi) for user-facing text", () => {
    const burmese = Object.entries(M).filter(([, v]) => typeof v === "string" && /[က-႟]/.test(v as string));
    expect(burmese.length).toBeGreaterThan(300);
    // Zawgyi-only code points / legacy ranges that never appear in Unicode Burmese text.
    for (const [k, v] of burmese) expect(v as string, k).not.toMatch(/[ၠ-႗]|[ꩠ-ꩿ]/);
  });
  it("translates and interpolates; falls back to key when missing", () => {
    const t = createTranslator("my");
    expect(t("nav.explore")).toBe(my.nav.explore);
    expect(t("home.daysLeft", { days: 2, hours: 3 })).toContain("2");
    expect(t("does.not.exist")).toBe("does.not.exist");
    expect(createTranslator("en")("status.REGISTRATION_OPEN")).toBe("Registration Open");
  });
  it("defaults are English", () => { expect(createTranslator("en")("hero.cta")).toBe("Explore Events"); });
});
