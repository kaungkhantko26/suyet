import { startOfYangonDay, yangonDateKey, yangonParts } from "./dates";

export type CalView = "month" | "week" | "list";
const DAY = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

/** Pure calendar math on yyyy-MM-dd keys (Myanmar calendar days). */
export function keyToUtcMs(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export const msToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => msToKey(keyToUtcMs(key) + n * DAY);
export const weekdayOf = (key: string) => new Date(keyToUtcMs(key)).getUTCDay();
export const todayKey = (now = new Date()) => yangonDateKey(now);

export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${p2((total % 12) + 1)}-01`;
}

/** Weeks (Sun–Sat) covering the month of `key`, each day as a yyyy-MM-dd key. */
export function monthGrid(key: string): string[][] {
  const [y, m] = key.split("-").map(Number);
  const first = `${y}-${p2(m)}-01`;
  const start = addDays(first, -weekdayOf(first));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${p2(m)}-${p2(daysInMonth)}`;
  const weeks: string[][] = [];
  for (let cur = start; keyToUtcMs(cur) <= keyToUtcMs(last); cur = addDays(cur, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
  }
  return weeks;
}

export function weekDays(key: string): string[] {
  const start = addDays(key, -weekdayOf(key));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** UTC range [from, to) for a view anchored on `key`. */
export function viewRange(view: CalView, key: string): { from: Date; to: Date; days: string[] } {
  let first: string, count: number;
  if (view === "week") { first = weekDays(key)[0]; count = 7; }
  else if (view === "month") { const g = monthGrid(key); first = g[0][0]; count = g.length * 7; }
  else { first = `${key.slice(0, 7)}-01`; count = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate(); }
  const from = startOfYangonDay(first)!;
  return { from, to: new Date(from.getTime() + count * DAY), days: Array.from({ length: count }, (_, i) => addDays(first, i)) };
}

export function parseCalParams(sp: { view?: string; date?: string; category?: string }, now = new Date()) {
  const view: CalView = sp.view === "week" || sp.view === "list" ? sp.view : "month";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(keyToUtcMs(sp.date)) ? sp.date : todayKey(now);
  const category = sp.category && /^[a-z0-9-]{1,80}$/.test(sp.category) ? sp.category : undefined;
  return { view, date, category };
}

export const dayOfMonth = (key: string) => Number(key.slice(8, 10));
export { yangonParts };
