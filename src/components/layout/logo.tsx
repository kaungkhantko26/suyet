import Image from "next/image";
import { cn } from "@/lib/cn";

/** Official "SY" ribbon monogram. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/logo-mark.png" alt="" width={384} height={256} priority className={cn("h-11 w-auto", className)} aria-hidden="true" />;
}

/** Product name — a project under LetsTech, built by LetsTech Club students. Keep in sync with config.brandName. */
const BRAND_NAME = "MeetPoint";
const PARENT_NAME = "LetsTech";

export function Wordmark({ className, showParent = true }: { className?: string; showParent?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        {showParent && <span className="text-[10px] font-medium tracking-wide text-muted uppercase">{PARENT_NAME}</span>}
        <span className="mt-0.5 text-[15px] font-semibold tracking-tight">{BRAND_NAME}</span>
      </span>
    </span>
  );
}
