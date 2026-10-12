"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/misc";

export interface NavItem { href: string; label: string; icon: ReactNode; exact?: boolean }

export function DashboardShell({ title, items, children }: { title: string; items: NavItem[]; children: ReactNode }) {
  const path = usePathname();
  const active = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));
  return (
    <Container className="py-8 sm:py-10">
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop only: on mobile these sections are reached from the Profile tab in the bottom nav instead. */}
        <nav aria-label={title} className="hidden min-w-0 lg:sticky lg:top-28 lg:block lg:self-start">
          <p className="eyebrow mb-3">{title}</p>
          <ul className="flex flex-col">
            {items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} aria-current={active(i) ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium whitespace-nowrap transition-colors", active(i) ? "bg-fg text-bg" : "text-muted hover:bg-fg/5 hover:text-fg")}>
                  <span aria-hidden="true" className="[&>svg]:size-4">{i.icon}</span>{i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
