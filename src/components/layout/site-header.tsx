import Link from "next/link";
import { ArrowRight, ChevronDown, LayoutDashboard, LogOut, Shield, Building2 } from "lucide-react";
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
                <div className="grid grid-cols-2 gap-3">
                  <ButtonLink href="/dashboard" variant="outline" className="min-h-14 rounded-full text-base"><LayoutDashboard className="size-4" aria-hidden="true" />{t("nav.dashboard")}</ButtonLink>
                  {can(user.role, "admin.access") ? <ButtonLink href="/admin" variant="outline" className="min-h-14 rounded-full text-base"><Shield className="size-4" aria-hidden="true" />{t("nav.admin")}</ButtonLink>
                    : can(user.role, "event.submit") ? <ButtonLink href="/organizer/dashboard" variant="outline" className="min-h-14 rounded-full text-base"><Building2 className="size-4" aria-hidden="true" />{t("nav.organizerArea")}</ButtonLink>
                    : <form action={logoutAction}><Button type="submit" variant="outline" className="min-h-14 w-full rounded-full text-base"><LogOut className="size-4" aria-hidden="true" />{t("nav.logout")}</Button></form>}
                </div>
                {user.role !== "STUDENT" && user.role !== "MODERATOR" && <form action={logoutAction}><Button type="submit" variant="ghost" className="w-full text-error"><LogOut className="size-4" aria-hidden="true" />{t("nav.logout")}</Button></form>}
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
