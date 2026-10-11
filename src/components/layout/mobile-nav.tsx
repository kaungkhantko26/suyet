"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useRef } from "react";
import { useT } from "@/i18n/client";
import { Wordmark } from "./logo";

export interface NavLink { href: string; label: string }

/**
 * Full-screen menu on the native <dialog> (focus trap, Esc to close and inert page come from the platform).
 * `pill` is the compact language control shown next to the close button; `children` renders below the links.
 */
export function MobileNav({ links, pill, children }: { links: NavLink[]; pill?: React.ReactNode; children?: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const closeOnLink = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest("a")) ref.current?.close(); };
  return (
    <>
      <button type="button" aria-label={t("nav.menu")} aria-haspopup="dialog" onClick={() => ref.current?.showModal()} className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface hover:bg-surface-2 lg:hidden">
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <dialog ref={ref} aria-label={t("nav.menu")} className="m-0 h-dvh max-h-none w-full max-w-none border-0 bg-bg p-0 text-fg backdrop:bg-transparent">
        <div className="mx-auto flex h-full max-w-xl flex-col px-4 pt-4 pb-6" onClick={closeOnLink}>
          <div className="flex shrink-0 items-center justify-between rounded-full border border-border bg-surface py-2 pr-2 pl-4 shadow-(--shadow-card)">
            <Wordmark />
            <div className="flex items-center gap-2">
              {pill}
              <button type="button" aria-label={t("nav.close")} onClick={() => ref.current?.close()} className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface hover:bg-surface-2">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <nav aria-label="Main" className="mt-8 flex-1 overflow-y-auto px-2">
            <ul>
              {links.map((l, i) => {
                const active = isActive(l.href);
                return (
                  <li key={l.href} className="border-b border-border first:border-t">
                    <Link href={l.href} aria-current={active ? "page" : undefined} className={`group flex min-h-[4.5rem] items-center gap-4 font-serif text-[2rem] leading-none font-medium tracking-tight transition-colors hover:text-primary ${active ? "text-primary" : ""}`}>
                      <span className="w-6 font-sans text-xs font-medium text-muted tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-6 flex shrink-0 flex-col gap-3 px-2">{children}</div>
        </div>
      </dialog>
    </>
  );
}
