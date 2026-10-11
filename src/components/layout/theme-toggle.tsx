"use client";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";

export function ThemeToggle() {
  const t = useT();
  function toggle() {
    const root = document.documentElement;
    const isDark = root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("lte-theme", next); } catch { /* storage unavailable */ }
  }
  return (
    <button type="button" onClick={toggle} aria-label={t("nav.theme")} className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-fg/5 hover:text-fg">
      <Sun className="hidden size-[18px] dark:block [[data-theme=dark]_&]:block [[data-theme=light]_&]:hidden" aria-hidden="true" />
      <Moon className="size-[18px] [[data-theme=dark]_&]:hidden [[data-theme=light]_&]:block dark:hidden" aria-hidden="true" />
    </button>
  );
}
