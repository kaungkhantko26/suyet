import Image from "next/image";
import { cn } from "@/lib/cn";

/** Official "SY" ribbon monogram. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/logo-mark.png" alt="" width={384} height={256} priority className={cn("h-11 w-auto", className)} aria-hidden="true" />;
}

/** Product name. Temporary: "Su Yet" for now — change later as needed (keep in sync with config.brandName). */
const BRAND_NAME = "Su Yet";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">{BRAND_NAME}</span>
      </span>
    </span>
  );
}
