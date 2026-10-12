"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { Compass, Trophy, CalendarDays, Building2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

const ICON: Record<string, typeof Compass> = { "/events": Compass, "/hackathons": Trophy, "/calendar": CalendarDays, "/organizers": Building2 };

export interface NavLink { href: string; label: string }

/**
 * Mobile primary nav: a fixed bottom tab bar (the destinations), plus a "Profile" tab that opens a bottom sheet
 * for the account actions a hamburger menu used to hold (dashboard, logout, language, theme…) — there is no
 * separate menu button anymore, only this bar and the sheet the profile tab opens.
 */
export function BottomNav({ links, profileLabel, avatarInitial, sheetTitle, sheet }: {
  links: NavLink[]; profileLabel: string; avatarInitial?: string; sheetTitle: string; sheet: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const itemClass = (active: boolean) => cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted hover:text-fg");

  return (
    <>
      <nav aria-label={t("nav.menu")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-xl items-stretch">
          {links.map((l) => {
            const Icon = ICON[l.href] ?? Compass;
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate px-1">{l.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => ref.current?.showModal()} className={itemClass(false)}>
            <span className="flex size-5 items-center justify-center rounded-full bg-fg text-[10px] font-semibold text-bg">{avatarInitial ?? <Compass className="size-3" aria-hidden="true" />}</span>
            <span className="max-w-full truncate px-1">{profileLabel}</span>
          </button>
        </div>
      </nav>

      <dialog ref={ref} aria-label={sheetTitle} className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[20px] border-0 border-t border-border bg-bg p-0 text-fg backdrop:bg-fg/30 lg:hidden">
        <div className="mx-auto flex max-h-[85dvh] max-w-xl flex-col px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) ref.current?.close(); }}>
          <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-fg/15" />
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <p className="text-base font-semibold">{sheetTitle}</p>
            <button type="button" aria-label={t("nav.close")} onClick={() => ref.current?.close()} className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface hover:bg-surface-2">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-1">{sheet}</div>
        </div>
      </dialog>
    </>
  );
}
