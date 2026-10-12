import Link from "next/link";
import { ArrowRight, Bell, Bookmark, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Shield, ShieldCheck, SlidersHorizontal, Building2, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/i18n/server";
import { ButtonLink, Button } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { LanguageSwitcher } from "./language-switcher";
import { NavLinks } from "./nav-links";
import { UserMenuLink } from "./user-menu-link";
import { DetailsDismiss } from "./details-dismiss";
import { BottomNav } from "./bottom-nav";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./logo";

export async function SiteHeader() {
  const [t, user] = await Promise.all([getT(), getCurrentUser()]);
  const links = [
    { href: "/events", label: t("nav.explore") },
    { href: "/hackathons", label: t("nav.hackathons") },
    { href: "/calendar", label: t("nav.calendar") },
    { href: "/organizers", label: t("nav.organizers") },
  ];
  const submitHref = user && can(user.role, "event.submit") ? "/organizer/events/new" : "/submit-event";
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <DetailsDismiss />
        <Container className="flex h-16 items-center gap-6">
          <Link href="/" aria-label={t("brand.name")} className="shrink-0"><Wordmark /></Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <div className="hidden items-center gap-2 lg:flex">
              {(!user || can(user.role, "event.submit")) && <ButtonLink href={submitHref} variant="outline" size="sm">{t("nav.submit")}</ButtonLink>}
              <LanguageSwitcher />
              <ThemeToggle />
              {user ? <UserMenu name={user.name} email={user.email} role={user.role} t={t} /> : <ButtonLink href="/auth/login" variant="dark" size="sm">{t("nav.login")}</ButtonLink>}
            </div>
            <div className="lg:hidden"><ThemeToggle /></div>
          </div>
        </Container>
      </header>

      <BottomNav
        links={links}
        profileLabel={user ? t("nav.profile") : t("nav.login")}
        avatarInitial={user?.name.slice(0, 1).toUpperCase()}
        sheetTitle={user ? user.name : t("nav.menu")}
        sheet={
          <>
            {user ? (
              <>
                <div className="rounded-[14px] border border-border bg-surface-2/60 px-4 py-3">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <span className="mt-2 inline-block rounded-full bg-fg/8 px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">{user.role}</span>
                </div>
                <nav aria-label={t("nav.dashboard")} className="-mx-1 space-y-0.5">
                  <SheetLink href="/dashboard"><LayoutDashboard className="size-4" aria-hidden="true" />{t("nav.dashboard")}</SheetLink>
                  <SheetLink href="/dashboard/saved"><Bookmark className="size-4" aria-hidden="true" />{t("dashboard.saved")}</SheetLink>
                  <SheetLink href="/dashboard/registrations"><ClipboardList className="size-4" aria-hidden="true" />{t("registration.myTitle")}</SheetLink>
                  <SheetLink href="/dashboard/notifications"><Bell className="size-4" aria-hidden="true" />{t("dashboard.notifications")}</SheetLink>
                  <SheetLink href="/dashboard/preferences"><SlidersHorizontal className="size-4" aria-hidden="true" />{t("dashboard.preferences")}</SheetLink>
                  <SheetLink href="/dashboard/profile"><UserRound className="size-4" aria-hidden="true" />{t("dashboard.profile")}</SheetLink>
                  <SheetLink href="/dashboard/security"><ShieldCheck className="size-4" aria-hidden="true" />{t("securityPage.title")}</SheetLink>
                  {can(user.role, "event.submit") && <SheetLink href="/organizer/dashboard"><Building2 className="size-4" aria-hidden="true" />{t("nav.organizerArea")}</SheetLink>}
                  {can(user.role, "admin.access") && <SheetLink href="/admin"><Shield className="size-4" aria-hidden="true" />{t("nav.admin")}</SheetLink>}
                </nav>
                <form action={logoutAction}><Button type="submit" variant="outline" className="w-full text-error"><LogOut className="size-4" aria-hidden="true" />{t("nav.logout")}</Button></form>
              </>
            ) : (
              <ButtonLink href="/auth/login" variant="outline" className="min-h-14 rounded-full text-base">{t("nav.login")}</ButtonLink>
            )}
            <LanguageSwitcher variant="wide" />
            {(!user || can(user.role, "event.submit")) && <ButtonLink href={submitHref} size="lg" className="min-h-14 rounded-full text-base shadow-(--shadow-raised)">{t("hero.ctaSecondary")}<ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>}
          </>
        }
      />
    </>
  );
}

function SheetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <UserMenuLink
      href={href}
      className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors hover:bg-fg/5 [&>svg]:text-muted"
      activeClassName="bg-fg/8 text-fg [&>svg]:text-fg"
    >
      {children}
    </UserMenuLink>
  );
}

function UserMenu({ name, email, role, t }: { name: string; email: string; role: string; t: Awaited<ReturnType<typeof getT>> }) {
  const item = "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors hover:bg-fg/5";
  const activeItem = "bg-fg/8 text-fg";
  return (
    <details data-dropdown className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-border bg-surface py-0.5 pr-2 pl-0.5 text-sm font-medium transition-colors hover:bg-surface-2 group-open:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 items-center justify-center rounded-[8px] bg-fg text-xs font-semibold text-bg">{name.slice(0, 1).toUpperCase()}</span>
        <span className="max-w-24 truncate">{name}</span>
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-[14px] border border-border bg-surface shadow-(--shadow-raised)">
        <div className="border-b border-border bg-surface-2/60 px-4 py-3">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <span className="mt-2 inline-block rounded-full bg-fg/8 px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">{role}</span>
        </div>
        <div className="p-1.5">
          <UserMenuLink href="/dashboard" className={item} activeClassName={activeItem}><LayoutDashboard className="size-4 text-muted" aria-hidden="true" />{t("nav.dashboard")}</UserMenuLink>
          {can(role as never, "event.submit") && <UserMenuLink href="/organizer/dashboard" className={item} activeClassName={activeItem}><Building2 className="size-4 text-muted" aria-hidden="true" />{t("nav.organizerArea")}</UserMenuLink>}
          {can(role as never, "admin.access") && <UserMenuLink href="/admin" className={item} activeClassName={activeItem}><Shield className="size-4 text-muted" aria-hidden="true" />{t("nav.admin")}</UserMenuLink>}
        </div>
        <form action={logoutAction} className="border-t border-border p-1.5"><button type="submit" className={`${item} cursor-pointer text-error`}><LogOut className="size-4" aria-hidden="true" />{t("nav.logout")}</button></form>
      </div>
    </details>
  );
}
