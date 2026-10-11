import { config } from "./config";

const TZ = config.timezone;
/** Myanmar Time is a fixed +06:30 offset with no DST. */
const OFFSET_MIN = 6 * 60 + 30;

export type Locale = "en" | "my";
const intlLocale = (l: Locale) => (l === "my" ? "my-MM" : "en-GB");

export function formatDate(d: Date | string, locale: Locale = "en", opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(new Date(d));
}

export function formatDateTime(d: Date | string, locale: Locale = "en") {
  return `${formatDate(d, locale)}, ${formatTime(d, locale)}`;
}

export function formatTime(d: Date | string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
}

/** Parts of an instant as seen on the wall clock in Myanmar Time. */
export function yangonParts(d: Date) {
  const shifted = new Date(d.getTime() + OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** yyyy-MM-dd of an instant in Myanmar Time. */
export function yangonDateKey(d: Date) {
  const p = yangonParts(d);
  return `${p.year}-${p2(p.month)}-${p2(p.day)}`;
}

/** UTC instant → value for <input type="datetime-local"> in Myanmar Time. */
export function toDateTimeLocal(d: Date | null | undefined) {
  if (!d) return "";
  const p = yangonParts(d);
  return `${p.year}-${p2(p.month)}-${p2(p.day)}T${p2(p.hour)}:${p2(p.minute)}`;
}

/** <input type="datetime-local"> value interpreted as Myanmar Time → UTC Date. */
export function fromDateTimeLocal(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const utc = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MIN * 60_000;
  const out = new Date(utc);
  return Number.isNaN(out.getTime()) ? null : out;
}

/** Start of the Myanmar calendar day (as UTC instant) for yyyy-MM-dd. */
export function startOfYangonDay(key: string) {
  return fromDateTimeLocal(`${key}T00:00`);
}
export function endOfYangonDay(key: string) {
  const s = startOfYangonDay(key);
  return s ? new Date(s.getTime() + 86_400_000 - 1) : null;
}

export interface Countdown {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
}
export function countdown(target: Date, now: Date = new Date()): Countdown {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
  return {
    expired: false,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
  };
}

export const daysAgo = (n: number, now: number = Date.now()) => new Date(now - n * 86_400_000);
