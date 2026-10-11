"use client";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { setParam, toggleParam } from "@/lib/events/filters";

export interface Option { value: string; label: string }
interface Props {
  categories: Option[];
  locations: Option[];
  organizers: Option[];
  /** Filters that are fixed by the page (e.g. category page) and hidden from the panel. */
  hide?: ("category" | "location")[];
  activeCount: number;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-border py-4 first:pt-0 last:border-0">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function ChipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="py-4 first:pt-0">
      <legend className="mb-3 text-base font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Pill/chip button used by the mobile sheet: filled when selected, outlined otherwise. */
function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-fg hover:border-fg/30",
      )}
    >
      {children}
    </button>
  );
}

function Controls({ categories, locations, organizers, hide = [], idp }: Props & { idp: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (next: URLSearchParams) => start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  const has = (k: string, v: string) => sp.getAll(k).flatMap((x) => x.split(",")).includes(v);
  const one = (k: string) => sp.get(k) ?? "";
  const multi = (key: string, opts: Option[], max?: number) => (
    <div className={max ? "max-h-56 overflow-y-auto pr-1" : ""}>
      {opts.map((o) => (
        <Checkbox key={o.value} label={o.label} defaultChecked={has(key, o.value)} onChange={() => go(toggleParam(normalizeMulti(sp, key), key, o.value))} id={`${idp}-${key}-${o.value}`} />
      ))}
    </div>
  );

  return (
    <div aria-busy={pending} key={sp.toString()}>
      {!hide.includes("category") && <Group title={t("events.category")}>{multi("category", categories, 8)}</Group>}
      {!hide.includes("location") && <Group title={t("events.location")}>{multi("location", locations, 8)}</Group>}
      <Group title={t("events.format")}>
        {multi("format", (["online", "onsite", "hybrid"] as const).map((v) => ({ value: v, label: t(`format.${v.toUpperCase()}`) })))}
      </Group>
      <Group title={t("events.fee")}>
        <Select aria-label={t("events.fee")} defaultValue={one("fee")} onChange={(e) => go(setParam(sp, "fee", e.target.value))}>
          <option value="">{t("events.anyOption")}</option>
          <option value="free">{t("common.free")}</option>
          <option value="paid">{t("common.paid")}</option>
        </Select>
      </Group>
      <Group title={t("events.eligibility")}>
        <Select aria-label={t("events.eligibility")} defaultValue={one("eligibility")} onChange={(e) => go(setParam(sp, "eligibility", e.target.value))}>
          <option value="">{t("events.anyOption")}</option>
          <option value="students">{t("events.eligStudents")}</option>
          <option value="university">{t("events.eligUniversity")}</option>
          <option value="open">{t("events.eligOpen")}</option>
        </Select>
      </Group>
      <Group title={t("events.skillLevel")}>
        {multi("skill", (["beginner", "intermediate", "advanced", "all_levels"] as const).map((v) => ({ value: v, label: t(`skill.${v.toUpperCase()}`) })))}
      </Group>
      <Group title={t("events.registration")}>
        <Select aria-label={t("events.registration")} defaultValue={one("registration")} onChange={(e) => go(setParam(sp, "registration", e.target.value))}>
          <option value="">{t("events.anyOption")}</option>
          <option value="open">{t("events.openOnly")}</option>
          <option value="closed">{t("events.closedOnly")}</option>
        </Select>
      </Group>
      <Group title={t("events.dateRange")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">{t("events.from")}
            <input type="date" defaultValue={one("from")} onChange={(e) => go(setParam(sp, "from", e.target.value))} className="mt-1 min-h-11 w-full rounded-[10px] border border-border bg-surface px-2 text-sm text-fg" />
          </label>
          <label className="text-xs text-muted">{t("events.to")}
            <input type="date" defaultValue={one("to")} onChange={(e) => go(setParam(sp, "to", e.target.value))} className="mt-1 min-h-11 w-full rounded-[10px] border border-border bg-surface px-2 text-sm text-fg" />
          </label>
        </div>
      </Group>
      <Group title={t("events.organizer")}>
        <Select aria-label={t("events.organizer")} defaultValue={one("organizer")} onChange={(e) => go(setParam(sp, "organizer", e.target.value))}>
          <option value="">{t("events.anyOption")}</option>
          {organizers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Group>
      <Group title={t("events.showPast")}>
        <Checkbox label={t("events.showPast")} defaultChecked={sp.get("past") === "1"} onChange={(e) => go(setParam(sp, "past", e.target.checked ? "1" : null))} />
      </Group>
    </div>
  );
}

/** Mobile bottom-sheet filters: pill/chip controls instead of checkbox lists and &lt;select&gt;s. */
function MobileControls({ categories, locations, organizers, hide = [] }: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (next: URLSearchParams) => start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  const has = (k: string, v: string) => sp.getAll(k).flatMap((x) => x.split(",")).includes(v);
  const one = (k: string) => sp.get(k) ?? "";
  const chips = (key: string, opts: Option[]) => (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Chip key={o.value} selected={has(key, o.value)} onClick={() => go(toggleParam(normalizeMulti(sp, key), key, o.value))}>{o.label}</Chip>
      ))}
    </div>
  );
  /** Single-value pill row (e.g. Free/Paid): clicking the active pill again clears it back to "Any". */
  const pills = (key: string, opts: Option[]) => (
    <div className="flex flex-wrap gap-2">
      <Chip selected={!one(key)} onClick={() => go(setParam(sp, key, null))}>{t("events.anyOption")}</Chip>
      {opts.map((o) => (
        <Chip key={o.value} selected={one(key) === o.value} onClick={() => go(setParam(sp, key, one(key) === o.value ? null : o.value))}>{o.label}</Chip>
      ))}
    </div>
  );

  return (
    <div aria-busy={pending} key={sp.toString()} className="divide-y divide-border">
      {!hide.includes("category") && <ChipGroup title={t("events.category")}>{chips("category", categories)}</ChipGroup>}
      {!hide.includes("location") && <ChipGroup title={t("events.location")}>{chips("location", locations)}</ChipGroup>}
      <ChipGroup title={t("events.format")}>{chips("format", (["online", "onsite", "hybrid"] as const).map((v) => ({ value: v, label: t(`format.${v.toUpperCase()}`) })))}</ChipGroup>
      <ChipGroup title={t("events.fee")}>{pills("fee", [{ value: "free", label: t("common.free") }, { value: "paid", label: t("common.paid") }])}</ChipGroup>
      <ChipGroup title={t("events.eligibility")}>{pills("eligibility", [{ value: "students", label: t("events.eligStudents") }, { value: "university", label: t("events.eligUniversity") }, { value: "open", label: t("events.eligOpen") }])}</ChipGroup>
      <ChipGroup title={t("events.skillLevel")}>{chips("skill", (["beginner", "intermediate", "advanced", "all_levels"] as const).map((v) => ({ value: v, label: t(`skill.${v.toUpperCase()}`) })))}</ChipGroup>
      <ChipGroup title={t("events.registration")}>{pills("registration", [{ value: "open", label: t("events.openOnly") }, { value: "closed", label: t("events.closedOnly") }])}</ChipGroup>
      <ChipGroup title={t("events.dateRange")}>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted">{t("events.from")}
            <input type="date" defaultValue={one("from")} onChange={(e) => go(setParam(sp, "from", e.target.value))} className="mt-1 min-h-11 w-full rounded-full border border-border bg-surface px-4 text-sm text-fg" />
          </label>
          <label className="text-xs font-medium text-muted">{t("events.to")}
            <input type="date" defaultValue={one("to")} onChange={(e) => go(setParam(sp, "to", e.target.value))} className="mt-1 min-h-11 w-full rounded-full border border-border bg-surface px-4 text-sm text-fg" />
          </label>
        </div>
      </ChipGroup>
      {organizers.length > 0 && (
        <ChipGroup title={t("events.organizer")}>
          <Select aria-label={t("events.organizer")} defaultValue={one("organizer")} onChange={(e) => go(setParam(sp, "organizer", e.target.value))} className="rounded-full">
            <option value="">{t("events.anyOption")}</option>
            {organizers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </ChipGroup>
      )}
      <ChipGroup title={t("events.showPast")}>
        <Chip selected={sp.get("past") === "1"} onClick={() => go(setParam(sp, "past", sp.get("past") === "1" ? null : "1"))}>{t("events.showPast")}</Chip>
      </ChipGroup>
    </div>
  );
}

/** Comma-separated values (?category=a,b) are expanded so toggling one keeps the rest. */
function normalizeMulti(sp: URLSearchParams, key: string) {
  const next = new URLSearchParams(sp);
  const vals = sp.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  next.delete(key);
  vals.forEach((v) => next.append(key, v));
  return next;
}

export function FiltersPanel(props: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const dialog = useRef<HTMLDialogElement>(null);
  // Keep q and sort when clearing; everything else resets.
  const clearAll = () => {
    const next = new URLSearchParams();
    for (const k of ["q", "sort"]) if (sp.get(k)) next.set(k, sp.get(k)!);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold">{t("common.filters")}</h2>
      {props.activeCount > 0 && <button type="button" onClick={clearAll} className="min-h-11 cursor-pointer text-sm font-medium underline underline-offset-4">{t("common.clearAll")}</button>}
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        <Button variant="outline" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t("common.filters")}
          {props.activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">{props.activeCount}</span>}
        </Button>
        <dialog ref={dialog} aria-label={t("common.filters")} className="m-0 mt-auto h-[88dvh] max-h-none w-full rounded-t-[20px] border-0 bg-bg p-0 text-fg backdrop:bg-black/40">
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-fg/15" />
            </div>
            <div className="relative flex items-center justify-center border-b border-border px-4 py-3.5">
              <p className="text-base font-bold">{t("common.filters")}</p>
              <button type="button" aria-label={t("nav.close")} onClick={() => dialog.current?.close()} className="absolute right-3 flex size-9 cursor-pointer items-center justify-center rounded-full bg-fg/5 hover:bg-fg/10"><X className="size-4" aria-hidden="true" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5"><MobileControls {...props} /></div>
            <div className="flex gap-2 border-t border-border p-4">
              {props.activeCount > 0 && <Button variant="outline" onClick={clearAll} className="flex-1 rounded-full">{t("common.clearAll")}</Button>}
              <Button onClick={() => dialog.current?.close()} className="flex-1 rounded-full">{t("events.apply")}</Button>
            </div>
          </div>
        </dialog>
      </div>
      <aside className="hidden lg:block" aria-label={t("common.filters")}>
        {header}
        <Controls {...props} idp="d" />
      </aside>
    </>
  );
}
