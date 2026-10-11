"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavItem { href: string; label: string }

/** Desktop primary nav: marks the current section active (exact match for "/", prefix match otherwise). */
export function NavLinks({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
      {links.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center rounded-[10px] px-3.5 text-sm font-medium transition-colors",
              active ? "text-fg" : "text-muted hover:bg-fg/5 hover:text-fg",
            )}
          >
            {l.label}
            <span aria-hidden="true" className={cn("absolute inset-x-3.5 -bottom-[1px] h-0.5 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} />
          </Link>
        );
      })}
    </nav>
  );
}
