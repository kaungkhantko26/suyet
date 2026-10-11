"use client";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toggleSaveAction } from "@/app/actions/student";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

export function SaveButton({ eventId, saved, authed, label = false, className }: { eventId: string; saved: boolean; authed: boolean; label?: boolean; className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, start] = useTransition();
  const text = optimistic ? t("details.unsave") : t("details.save");
  const base = cn(
    "flex min-h-11 items-center justify-center gap-2 rounded-[10px] transition-colors cursor-pointer",
    label ? "border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2" : "size-11 hover:bg-fg/8",
    className,
  );
  const icon = <Bookmark className={cn("size-[18px]", optimistic && "fill-primary text-primary")} aria-hidden="true" />;
  if (!authed) {
    return (
      <Link href={`/auth/login?next=${encodeURIComponent(pathname)}`} aria-label={t("details.loginToSave")} title={t("details.loginToSave")} className={base}>
        {icon}{label && <span>{t("details.save")}</span>}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={text}
      title={text}
      className={base}
      onClick={() => start(async () => { setOptimistic(!optimistic); await toggleSaveAction(eventId); })}
    >
      {icon}{label && <span>{text}</span>}
    </button>
  );
}
