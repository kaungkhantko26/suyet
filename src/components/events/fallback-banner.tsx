import { CategoryIcon } from "@/components/ui/category-icon";

const TINTS = [
  { bg: "#dbeafe", fg: "#1d4ed8" }, // blue
  { bg: "#ede9fe", fg: "#6d28d9" }, // purple
  { bg: "#ccfbf1", fg: "#0f766e" }, // teal
  { bg: "#ffedd5", fg: "#c2410c" }, // brand orange
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Clean category-based graphic used when an event has no banner. Decorative only. */
export function FallbackBanner({ slug, icon, className = "" }: { slug: string; icon: string; className?: string }) {
  const tint = TINTS[hash(slug) % TINTS.length];
  return (
    <div aria-hidden="true" className={`relative flex size-full items-center justify-center overflow-hidden ${className}`} style={{ background: tint.bg, color: tint.fg }}>
      <svg className="absolute inset-0 size-full opacity-[0.18]" xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id={`g-${slug}`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" /></pattern></defs>
        <rect width="100%" height="100%" fill={`url(#g-${slug})`} />
      </svg>
      <CategoryIcon name={icon} className="relative size-12" />
    </div>
  );
}
