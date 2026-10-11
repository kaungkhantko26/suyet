"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search, Tag, MapPin, CalendarDays } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { Suggestion } from "@/app/api/search/suggest/route";

const ICON = { category: Tag, location: MapPin, event: CalendarDays } as const;

/**
 * Search box with a keyword/keyword-ish suggestions dropdown (matching categories, locations and event titles).
 * Stays a normal <input name="q"> inside the surrounding <form>, so plain submission (Enter, no JS) still works;
 * the dropdown is a progressive enhancement layered on top.
 */
export function SearchAutocomplete({ id, name = "q", defaultValue = "", placeholder, className, inputClassName }: {
  id: string; name?: string; defaultValue?: string; placeholder: string; className?: string; inputClassName?: string;
}) {
  const t = useT();
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounced fetch kicked off from the change handler (not an effect), so results only ever land from a real keystroke. */
  function queueFetch(raw: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = raw.trim();
    if (q.length < 2) { setItems([]); setOpen(false); return; }
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&locale=${t.locale}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data: { suggestions: Suggestion[] }) => { setItems(data.suggestions ?? []); setOpen(true); setActive(-1); })
        .catch(() => {});
    }, 200);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); abortRef.current?.abort(); }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const choose = (item: Suggestion) => { setOpen(false); setValue(item.label); router.push(item.href); };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        maxLength={100}
        value={value}
        onChange={(e) => { setValue(e.target.value); queueFetch(e.target.value); }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className={cn("min-h-12 w-full rounded-[10px] border border-border bg-surface pr-3 pl-10 text-sm placeholder:text-muted/80 focus-visible:border-primary", inputClassName)}
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-[12px] border border-border bg-surface py-1.5 shadow-(--shadow-raised)">
          {items.map((item, i) => {
            const Icon = ICON[item.kind];
            return (
              <li key={`${item.kind}-${item.href}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm", i === active ? "bg-fg/5" : "hover:bg-fg/5")}
                >
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{t(`events.suggestKind.${item.kind}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
