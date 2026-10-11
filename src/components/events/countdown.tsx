"use client";
import { useSyncExternalStore } from "react";
import { countdown } from "@/lib/dates";
import { useT } from "@/i18n/client";

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
// Snapshot is bucketed to the minute so React sees a stable value between ticks.
const getSnapshot = () => Math.floor(Date.now() / 60_000);

/** Live countdown that never shows an expired deadline as open. */
export function Countdown({ target, className }: { target: string; className?: string }) {
  const t = useT();
  const minute = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const now = minute === 0 ? new Date() : new Date(minute * 60_000);
  const c = countdown(new Date(target), now);
  const text = c.expired ? t("home.closedAlready")
    : c.days > 0 ? t("home.daysLeft", { days: c.days, hours: c.hours })
    : c.hours > 0 ? t("home.hoursLeft", { hours: c.hours, minutes: c.minutes })
    : t("home.minutesLeft", { minutes: Math.max(1, c.minutes) });
  return <span className={className} suppressHydrationWarning>{text}</span>;
}
