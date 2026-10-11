import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import { Container } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { db } from "@/lib/db";
import { addDays, addMonths, dayOfMonth, parseCalParams, todayKey, viewRange, monthGrid, weekDays, type CalView } from "@/lib/calendar";
import { formatTime, yangonDateKey } from "@/lib/dates";
import { getCategories } from "@/lib/events/lookups";
import { publicWhere } from "@/lib/events/queries";
import { categoryName } from "@/lib/events/view";
import { cn } from "@/lib/cn";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("calendar.title"), description: t("calendar.description"), alternates: { canonical: "/calendar" } };
}

interface Item { id: string; slug: string; title: string; at: Date; kind: "event" | "deadline" }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [t, sp, categories] = await Promise.all([getT(), searchParams, getCategories()]);
  const { view, date, category } = parseCalParams(sp);
  const locale = t.locale;
  const { from, to, days } = viewRange(view, date);

  const rows = await db.event.findMany({
    where: {
      ...publicWhere,
      ...(category ? { categories: { some: { category: { slug: category } } } } : {}),
      OR: [{ startAt: { gte: from, lt: to } }, { registrationDeadline: { gte: from, lt: to } }],
    },
    select: { id: true, slug: true, title: true, startAt: true, registrationDeadline: true, cancelled: true },
    orderBy: { startAt: "asc" },
    take: 500,
  });
  const byDay = new Map<string, Item[]>();
  const push = (k: string, i: Item) => byDay.set(k, [...(byDay.get(k) ?? []), i]);
  for (const e of rows) {
    if (e.startAt >= from && e.startAt < to) push(yangonDateKey(e.startAt), { id: e.id, slug: e.slug, title: e.title, at: e.startAt, kind: "event" });
    if (e.registrationDeadline && e.registrationDeadline >= from && e.registrationDeadline < to && !e.cancelled) push(yangonDateKey(e.registrationDeadline), { id: `${e.id}-d`, slug: e.slug, title: t("calendar.deadlineOf", { title: e.title }), at: e.registrationDeadline, kind: "deadline" });
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());

  const href = (over: Partial<{ view: CalView; date: string }>) => {
    const q = new URLSearchParams();
    q.set("view", over.view ?? view);
    q.set("date", over.date ?? date);
    if (category) q.set("category", category);
    return `/calendar?${q}`;
  };
  const step = view === "week" ? 7 : 0;
  const prev = step ? addDays(date, -7) : addMonths(date, -1);
  const next = step ? addDays(date, 7) : addMonths(date, 1);
  const [y, m] = date.split("-").map(Number);
  const months = t.raw<string[]>("calendar.months");
  const weekdays = t.raw<string[]>("calendar.weekdays");
  const heading = view === "week" ? `${days[0]} → ${days[6]}` : `${months[m - 1]} ${y}`;
  const today = todayKey();
  const sameMonth = (k: string) => k.slice(0, 7) === date.slice(0, 7);

  const chip = (i: Item) => (
    <Link key={i.id} href={`/events/${i.slug}`} className={cn("flex items-start gap-1 rounded-[6px] px-1.5 py-1 text-xs leading-tight hover:underline", i.kind === "event" ? "bg-info-bg text-fg" : "bg-warning-bg text-warning")}>
      {i.kind === "deadline" && <Hourglass className="mt-px size-3 shrink-0" aria-hidden="true" />}
      <span className="line-clamp-2"><span className="tabular-nums opacity-70">{formatTime(i.at, locale)}</span> {i.title}</span>
    </Link>
  );

  const dayList = (keys: string[]) => (
    <ol className="divide-y divide-border rounded-[16px] border border-border bg-surface">
      {keys.filter((k) => byDay.get(k)?.length).map((k) => (
        <li key={k} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr]">
          <p className={cn("text-sm font-semibold tabular-nums", k === today && "text-primary")}>{k}<span className="ml-2 font-normal text-muted">{weekdays[new Date(`${k}T00:00:00Z`).getUTCDay()]}</span></p>
          <div className="flex flex-col gap-1.5">{byDay.get(k)!.map(chip)}</div>
        </li>
      ))}
      {!keys.some((k) => byDay.get(k)?.length) && <li className="p-8 text-center text-sm text-muted">{t("calendar.empty")}</li>}
    </ol>
  );

  return (
    <Container className="py-10 sm:py-14">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{t("calendar.title")}</h1>
        <p className="mt-2 text-muted">{t("calendar.description")}</p>
      </header>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={href({ date: prev })} aria-label={t("calendar.prev")} className="flex size-11 items-center justify-center rounded-[10px] border border-border bg-surface hover:bg-surface-2"><ChevronLeft className="size-4" aria-hidden="true" /></Link>
          <Link href={href({ date: next })} aria-label={t("calendar.next")} className="flex size-11 items-center justify-center rounded-[10px] border border-border bg-surface hover:bg-surface-2"><ChevronRight className="size-4" aria-hidden="true" /></Link>
          <ButtonLink href={href({ date: today })} variant="outline" className="ml-1">{t("calendar.today")}</ButtonLink>
        </div>
        <h2 className="font-serif text-xl font-medium" aria-live="polite">{heading}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div role="group" aria-label="View" className="flex rounded-[10px] border border-border bg-surface p-0.5">
            {(["month", "week", "list"] as const).map((v) => (
              <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("flex min-h-10 items-center rounded-[8px] px-3.5 text-sm font-medium", view === v ? "bg-fg text-bg" : "text-muted hover:text-fg")}>{t(`calendar.${v}`)}</Link>
            ))}
          </div>
          <form action="/calendar" className="flex gap-2">
            <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={date} />
            <label className="sr-only" htmlFor="cal-cat">{t("events.category")}</label>
            <Select id="cal-cat" name="category" defaultValue={category ?? ""} className="w-auto min-w-44">
              <option value="">{t("events.category")}: {t("common.all")}</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{categoryName(c, locale)}</option>)}
            </Select>
            <button className="min-h-11 cursor-pointer rounded-[10px] border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("common.apply")}</button>
          </form>
        </div>
      </div>
      <p className="mb-4 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-info-bg ring-1 ring-border" />{t("calendar.events")}</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-warning-bg ring-1 ring-border" />{t("calendar.deadlines")}</span>
      </p>

      {view === "list" && dayList(days)}
      {view === "month" && (
        <>
          <div className="hidden overflow-hidden rounded-[16px] border border-border bg-surface md:block">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-xs font-semibold text-muted">
              {weekdays.map((w, i) => <div key={i} className="px-2 py-2">{w.slice(0, locale === "my" ? 20 : 3)}</div>)}
            </div>
            {monthGrid(date).map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-border last:border-0">
                {week.map((k) => (
                  <div key={k} className={cn("min-h-28 border-r border-border p-1.5 last:border-0", !sameMonth(k) && "bg-surface-2/60 text-muted")}>
                    <p className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums", k === today && "bg-primary font-semibold text-primary-fg")}>{dayOfMonth(k)}</p>
                    <div className="flex flex-col gap-1">
                      {(byDay.get(k) ?? []).slice(0, 3).map(chip)}
                      {(byDay.get(k)?.length ?? 0) > 3 && <Link href={href({ view: "week", date: k })} className="px-1 text-xs text-muted hover:underline">{t("calendar.more", { n: byDay.get(k)!.length - 3 })}</Link>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="md:hidden">{dayList(days.filter(sameMonth))}</div>
        </>
      )}
      {view === "week" && dayList(weekDays(date))}
    </Container>
  );
}
