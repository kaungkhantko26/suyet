import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-fg/8 text-fg",
      success: "bg-success-bg text-success",
      warning: "bg-warning-bg text-warning",
      error: "bg-error-bg text-error",
      info: "bg-info-bg text-primary",
      outline: "border border-border text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}
