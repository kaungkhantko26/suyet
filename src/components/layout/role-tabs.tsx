import Link from "next/link";
import { cn } from "@/lib/cn";

export function RoleTabs({ active, student, organizer }: { active: "student" | "organizer"; student: string; organizer: string }) {
  const tab = (on: boolean) => cn("flex min-h-11 flex-1 items-center justify-center rounded-[8px] text-sm font-medium", on ? "bg-fg text-bg" : "text-muted hover:text-fg");
  return (
    <div role="tablist" className="mb-4 flex gap-1 rounded-[10px] border border-border bg-surface-2 p-1">
      <Link role="tab" aria-selected={active === "student"} href="/auth/register" className={tab(active === "student")}>{student}</Link>
      <Link role="tab" aria-selected={active === "organizer"} href="/auth/register/organizer" className={tab(active === "organizer")}>{organizer}</Link>
    </div>
  );
}
