import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { EventGrid } from "@/components/events/event-grid";
import { SearchAutocomplete } from "@/components/events/search-autocomplete";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Container, EmptyState, SectionHeader } from "@/components/ui/misc";
import { LogoMark } from "@/components/layout/logo";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { getCategories, getLocations, getSavedIds, upcomingCountByLocation } from "@/lib/events/lookups";
import { getClosingSoon, getFeatured, getOnlineEvents, getUpcomingByCategory } from "@/lib/events/queries";
import { categoryName, locationName } from "@/lib/events/view";
import { getT } from "@/i18n/server";

const QUICK = [
  { key: "all", href: "/events", labelKey: "common.all" },
  { key: "hackathons", href: "/events?category=hackathons" },
  { key: "ai", href: "/events?category=artificial-intelligence&category=machine-learning", label: { en: "AI & ML", my: "AI နှင့် ML" } },
  { key: "cyber", href: "/events?category=cybersecurity" },
  { key: "workshops", href: "/events?category=technology-workshops" },
  { key: "design", href: "/events?category=ui-ux-design" },
  { key: "startups", href: "/events?category=startup-competitions" },
] as const;
const CATEGORY_SLUG: Record<string, string> = { hackathons: "hackathons", cyber: "cybersecurity", workshops: "technology-workshops", design: "ui-ux-design", startups: "startup-competitions" };

const HOME_CATEGORIES = ["hackathons", "programming-competitions", "artificial-intelligence", "cybersecurity", "ui-ux-design", "startup-competitions", "technology-workshops", "conferences", "robotics", "data-science"];

export default async function HomePage() {
  const [t, user, categories, locations] = await Promise.all([getT(), getCurrentUser(), getCategories(), getLocations()]);
  const locale = t.locale;
  const [featured, closing, hackathons, online, counts, savedIds] = await Promise.all([
    getFeatured(3), getClosingSoon(3), getUpcomingByCategory("hackathons", 3), getOnlineEvents(3), upcomingCountByLocation(), getSavedIds(user?.id),
  ]);
  const authed = !!user;
  const grid = (events: Awaited<ReturnType<typeof getFeatured>>) => <EventGrid events={events} t={t} savedIds={savedIds} authed={authed} />;
  const upNext = closing.length ? closing : featured;
  const homeCats = HOME_CATEGORIES.map((s) => categories.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => !!c);
  const regions = locations.filter((l) => ["REGION", "STATE", "UNION_TERRITORY"].includes(l.type));

  return (
    <>
      {/* 01 Hero */}
      <section className="border-b border-border">
        <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:py-24">
          <div>
            <p className="eyebrow flex items-center gap-2"><LogoMark className="h-4" />{t("hero.eyebrow")}</p>
            <h1 className="mt-5 font-serif text-[2.5rem] leading-[1.05] font-medium tracking-tight sm:text-6xl">
              {t("hero.title1")}<br />{t("hero.title2")}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t("hero.description")}</p>
            <form action="/events" role="search" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
              <SearchAutocomplete id="hero-search" placeholder={t("hero.searchPlaceholder")} className="flex-1" />
              <Button type="submit" size="lg">{t("common.search")}</Button>
            </form>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("home.interestTitle")}>
              {QUICK.map((q) => {
                const cat = CATEGORY_SLUG[q.key] ? categories.find((c) => c.slug === CATEGORY_SLUG[q.key]) : null;
                const label = "labelKey" in q ? t(q.labelKey) : "label" in q ? q.label[locale] : cat ? categoryName(cat, locale) : q.key;
                return <li key={q.key}><Link href={q.href} className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-fg/40 hover:bg-surface-2">{label}</Link></li>;
              })}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/events" size="lg">{t("hero.cta")}<ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
              <ButtonLink href="/submit-event" variant="outline" size="lg">{t("hero.ctaSecondary")}</ButtonLink>
            </div>
            <p className="mt-6 text-sm font-medium italic">{t("hero.supporting")}</p>
          </div>

          <aside aria-labelledby="upnext" className="rounded-[16px] border border-border bg-surface p-6 shadow-(--shadow-card)">
            <h2 id="upnext" className="eyebrow">{t("home.closingTitle")}</h2>
            {upNext.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t("home.emptyClosing")}</p>
            ) : (
              <ol className="mt-4 divide-y divide-border">
                {upNext.map((e, i) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.slug}`} className="group flex min-h-16 items-start gap-4 py-4">
                      <span className="font-serif text-2xl text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium group-hover:underline">{e.title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{formatDate(e.registrationDeadline ?? e.startAt, locale)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <Link href="/events?sort=deadline" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">{t("common.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Link>
          </aside>
        </Container>
      </section>

      {/* 02 Featured */}
      <Container className="pt-20">
        <SectionHeader n="01" title={t("home.featuredTitle")} desc={t("home.featuredDesc")} action={<ButtonLink href="/events" variant="ghost">{t("common.viewAll")}</ButtonLink>} />
        {featured.length ? grid(featured) : <EmptyState title={t("home.emptyFeatured")} />}
      </Container>

      {/* 03 Closing soon */}
      <Container className="pt-20">
        <SectionHeader n="02" title={t("home.closingTitle")} desc={t("home.closingDesc")} action={<ButtonLink href="/events?sort=deadline&registration=open" variant="ghost">{t("common.viewAll")}</ButtonLink>} />
        {closing.length ? grid(closing) : <EmptyState title={t("home.emptyClosing")} />}
      </Container>

      {/* 04 Interests */}
      <Container className="pt-20">
        <SectionHeader n="03" title={t("home.interestTitle")} desc={t("home.interestDesc")} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {homeCats.map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}`} className="group flex h-full min-h-28 flex-col justify-between rounded-[16px] border border-border bg-surface p-4 transition-colors hover:border-fg/40">
                <CategoryIcon name={c.icon} className="size-6 text-primary" />
                <span className="mt-6 text-sm font-medium group-hover:underline">{categoryName(c, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/events" className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">{t("common.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </Container>

      {/* 05 Hackathons */}
      <Container className="pt-20">
        <SectionHeader n="04" title={t("home.hackathonsTitle")} desc={t("home.hackathonsDesc")} action={<ButtonLink href="/hackathons" variant="ghost">{t("common.viewAll")}</ButtonLink>} />
        {hackathons.length ? grid(hackathons) : <EmptyState title={t("home.emptyHackathons")} />}
      </Container>

      {/* 06 Across Myanmar */}
      <Container className="pt-20">
        <SectionHeader n="05" title={t("home.locationTitle")} desc={t("home.locationDesc")} />
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {regions.map((l) => (
            <li key={l.id}>
              <Link href={`/locations/${l.slug}`} className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-4 text-sm transition-colors hover:border-fg/40">
                <span className="line-clamp-1">{locationName(l, locale)}</span>
                {counts[l.slug] ? <span className="rounded-full bg-fg/8 px-2 py-0.5 text-xs font-medium tabular-nums">{counts[l.slug]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      {/* 07 Online */}
      <Container className="pt-20">
        <SectionHeader n="06" title={t("home.onlineTitle")} desc={t("home.onlineDesc")} action={<ButtonLink href="/events?format=online&format=hybrid" variant="ghost"><Globe2 className="size-4" aria-hidden="true" />{t("common.viewAll")}</ButtonLink>} />
        {online.length ? grid(online) : <EmptyState title={t("home.emptyOnline")} body={t("home.emptyOnlineHint")} action={<ButtonLink href="/submit-event" variant="outline">{t("hero.ctaSecondary")}</ButtonLink>} />}
      </Container>

      {/* 08 Organizers */}
      <Container className="pt-24">
        <div className="grid gap-8 rounded-[16px] bg-fg p-8 text-bg sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.12em] uppercase opacity-70">{t("home.organizersTitle")}</p>
            <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl">{t("home.organizersHeading")}</h2>
            <p className="mt-3 opacity-80">{t("home.organizersDesc")}</p>
          </div>
          <ButtonLink href="/submit-event" size="lg" className="bg-bg text-fg hover:opacity-90">{t("hero.ctaSecondary")}<ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
        </div>
      </Container>

      {/* 09 Newsletter */}
      <Container className="pt-24">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-serif text-3xl font-medium tracking-tight">{t("home.newsletterTitle")}</h2>
            <p className="mt-2 max-w-md text-muted">{t("home.newsletterDesc")}</p>
          </div>
          <NewsletterForm />
        </div>
      </Container>
    </>
  );
}
