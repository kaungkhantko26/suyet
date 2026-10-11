import { Languages } from "lucide-react";
import { setLocaleAction } from "@/app/actions/preferences";
import { getLocale, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";

/**
 * `segmented` (desktop header): EN | မြန်မာ.
 * `pill` / `wide` (mobile menu): a single button that switches to the other language, labelled in that language.
 */
export async function LanguageSwitcher({ variant = "segmented", className }: { variant?: "segmented" | "pill" | "wide"; className?: string }) {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  if (variant !== "segmented") {
    const next = locale === "en" ? { v: "my", label: "မြန်မာ" } : { v: "en", label: "English" };
    return (
      <form action={setLocaleAction} className={variant === "wide" ? "w-full" : undefined}>
        <button
          name="locale"
          value={next.v}
          lang={next.v}
          aria-label={`${t("nav.language")}: ${next.label}`}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface font-medium transition-colors hover:bg-surface-2",
            variant === "wide" ? "min-h-14 w-full text-base" : "min-h-11 px-5 text-sm",
            className,
          )}
        >
          {variant === "wide" && <Languages className="size-4 text-muted" aria-hidden="true" />}
          {next.label}
        </button>
      </form>
    );
  }
  const opts = [{ v: "en", short: "EN", name: "English" }, { v: "my", short: "မြန်မာ", name: "မြန်မာ" }];
  return (
    <form action={setLocaleAction} aria-label={t("nav.language")} className="flex items-center gap-1 rounded-[10px] border border-border bg-surface-2 p-1">
      <Languages className="mx-1.5 size-4 text-muted" aria-hidden="true" />
      {opts.map((o) => (
        <button key={o.v} name="locale" value={o.v} lang={o.v} aria-label={o.name} aria-pressed={locale === o.v}
          className={cn("flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-[8px] px-2 text-xs font-medium transition-colors", locale === o.v ? "bg-fg text-bg shadow-sm" : "text-muted hover:bg-fg/5 hover:text-fg")}>
          {o.short}
        </button>
      ))}
    </form>
  );
}
