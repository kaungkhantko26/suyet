import { cn } from "@/lib/cn";

/** Geometric "SY" monogram (brand orange) for the Su Yet name. Swap for an official SVG when supplied. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="-20 -20 480 340" className={cn("h-7 w-auto text-[#FF6A00]", className)} fill="none" stroke="currentColor" strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M170,60 C170,20 130,0 90,0 C50,0 10,20 10,70 C10,120 60,130 100,150 C140,170 190,180 190,230 C190,280 150,300 110,300 C70,300 30,280 30,240" />
      <path d="M250,0 L330,130 M410,0 L330,130 M330,130 L330,300" />
    </svg>
  );
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
