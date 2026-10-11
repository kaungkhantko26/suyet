import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[16px] border border-border bg-surface shadow-(--shadow-card)", className)} {...p} />;
}
