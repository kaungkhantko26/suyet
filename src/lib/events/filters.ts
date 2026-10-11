import { z } from "zod";

export const SORTS = ["upcoming", "deadline", "newest", "date"] as const;
export type Sort = (typeof SORTS)[number];

export interface EventFilters {
  q?: string;
  category: string[];
  location: string[];
  format: ("ONSITE" | "ONLINE" | "HYBRID")[];
  fee?: "free" | "paid";
  eligibility?: "students" | "open" | "university";
  skill?: ("ALL_LEVELS" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED")[];
  registration?: "open" | "closed";
  from?: string; // yyyy-MM-dd (Myanmar date)
  to?: string;
  organizer?: string;
  past: boolean;
  sort: Sort;
  page: number;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function all(params: Params, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  const v = params[key];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(",")).filter(Boolean);
}
function one(params: Params, key: string): string | undefined {
  return all(params, key)[0];
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const FORMATS = ["ONSITE", "ONLINE", "HYBRID"] as const;
const SKILLS = ["ALL_LEVELS", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

/** Lenient parser: invalid values are dropped instead of failing the whole page. */
export function parseEventFilters(params: Params): EventFilters {
  const pick = <T extends string>(vals: string[], allowed: readonly T[]) =>
    vals.map((v) => v.toUpperCase()).filter((v): v is T => (allowed as readonly string[]).includes(v));
  const q = one(params, "q")?.trim().slice(0, 100);
  const fee = one(params, "fee");
  const elig = one(params, "eligibility");
  const reg = one(params, "registration");
  const sort = one(params, "sort");
  const from = one(params, "from");
  const to = one(params, "to");
  const org = one(params, "organizer");
  const page = Number.parseInt(one(params, "page") ?? "1", 10);
  return {
    q: q || undefined,
    category: all(params, "category").filter((v) => slug.safeParse(v).success),
    location: all(params, "location").filter((v) => slug.safeParse(v).success),
    format: pick(all(params, "format"), FORMATS),
    fee: fee === "free" || fee === "paid" ? fee : undefined,
    eligibility: elig === "students" || elig === "open" || elig === "university" ? elig : undefined,
    skill: pick(all(params, "skill"), SKILLS),
    registration: reg === "open" || reg === "closed" ? reg : undefined,
    from: from && dateKey.safeParse(from).success ? from : undefined,
    to: to && dateKey.safeParse(to).success ? to : undefined,
    organizer: org && slug.safeParse(org).success ? org : undefined,
    past: one(params, "past") === "1",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Sort) : "upcoming",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

/** Serialize filters back to a query string; omits defaults so URLs stay short and canonical. */
export function filtersToSearchParams(f: Partial<EventFilters>): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  f.category?.forEach((v) => sp.append("category", v));
  f.location?.forEach((v) => sp.append("location", v));
  f.format?.forEach((v) => sp.append("format", v.toLowerCase()));
  if (f.fee) sp.set("fee", f.fee);
  if (f.eligibility) sp.set("eligibility", f.eligibility);
  f.skill?.forEach((v) => sp.append("skill", v.toLowerCase()));
  if (f.registration) sp.set("registration", f.registration);
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (f.organizer) sp.set("organizer", f.organizer);
  if (f.past) sp.set("past", "1");
  if (f.sort && f.sort !== "upcoming") sp.set("sort", f.sort);
  if (f.page && f.page > 1) sp.set("page", String(f.page));
  return sp;
}

/** Toggle one value of a multi-value filter, preserving every other filter and resetting pagination. */
export function toggleParam(current: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(current);
  const existing = next.getAll(key);
  next.delete(key);
  if (existing.includes(value)) existing.filter((v) => v !== value).forEach((v) => next.append(key, v));
  else [...existing, value].forEach((v) => next.append(key, v));
  next.delete("page");
  return next;
}

/** Set (or clear when empty) a single-value filter, preserving all others and resetting pagination. */
export function setParam(current: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(current);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key !== "page") next.delete("page");
  return next;
}

export function countActiveFilters(f: EventFilters): number {
  return (
    f.category.length + f.location.length + f.format.length + (f.skill?.length ?? 0) +
    [f.fee, f.eligibility, f.registration, f.from, f.to, f.organizer, f.q].filter(Boolean).length +
    (f.past ? 1 : 0)
  );
}
