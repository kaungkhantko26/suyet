"use client";
import { useEffect } from "react";

/** Closes any open header dropdown (<details data-dropdown>) on outside click, Esc, or after choosing a link. */
export function DetailsDismiss() {
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>("details[data-dropdown][open]");
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      for (const d of open()) if (!d.contains(target) || (target as HTMLElement).closest?.("a")) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of open()) { d.open = false; d.querySelector("summary")?.focus(); }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);
  return null;
}
