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
        <nav aria-label={title} className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow mb-3 hidden lg:block">{title}</p>
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {items.map((i) => (
              <li key={i.href} className="shrink-0">
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
