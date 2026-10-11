import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Translator } from "@/i18n/core";
import { cn } from "@/lib/cn";

/** Server-rendered pagination: plain links keep every other filter in the URL. */
export function Pagination({ page, pages, basePath, params, t }: { page: number; pages: number; basePath: string; params: URLSearchParams; t: Translator }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p)); else sp.delete("page");
    return `${basePath}${sp.size ? `?${sp}` : ""}`;
  };
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const item = "flex size-11 items-center justify-center rounded-[10px] border border-border bg-surface text-sm font-medium hover:bg-surface-2";
  return (
    <nav aria-label={t("common.page", { page, total: pages })} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={item} aria-label={t("common.previous")}><ChevronLeft className="size-4" aria-hidden="true" /></Link> : null}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - nums[i - 1] > 1 && <span aria-hidden="true" className="text-muted">…</span>}
          <Link href={href(n)} aria-current={n === page ? "page" : undefined} className={cn(item, n === page && "border-fg bg-fg text-bg hover:bg-fg")}>{n}</Link>
        </span>
      ))}
      {page < pages ? <Link href={href(page + 1)} rel="next" className={item} aria-label={t("common.next")}><ChevronRight className="size-4" aria-hidden="true" /></Link> : null}
    </nav>
  );
}
