import { useSearchParams } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/client";

/** Plain <a> to a route handler that redirects to Google — a real top-level navigation, not a fetch. */
export function GoogleButton({ intent }: { intent?: "organizer" }) {
  const t = useT();
  const next = useSearchParams().get("next");
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (intent) params.set("intent", intent);
  const href = `/api/auth/google${params.size ? `?${params}` : ""}`;
  return (
    <a href={href} className={cn(buttonStyles({ variant: "outline", size: "lg" }), "w-full")}>
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
        <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.42-.22-2.04H12v3.91h6.56c-.13 1.1-.84 2.75-2.42 3.86l-.02.15 3.52 2.73.24.02c2.24-2.07 3.64-5.11 3.64-8.63Z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.78-2.93c-1.01.71-2.36 1.2-4.15 1.2-3.17 0-5.86-2.14-6.82-5.02l-.14.01-3.67 2.84-.05.13C3.31 21.3 7.33 24 12 24Z" />
        <path fill="#FBBC05" d="M5.18 14.33a7.16 7.16 0 0 1-.38-2.33c0-.81.14-1.59.37-2.33l-.01-.16-3.71-2.88-.12.06A11.94 11.94 0 0 0 0 12c0 1.93.47 3.76 1.33 5.31l3.85-2.98Z" />
        <path fill="#EA4335" d="M12 4.75c2.26 0 3.78.97 4.65 1.79l3.39-3.31C17.94 1.19 15.24 0 12 0 7.33 0 3.31 2.7 1.33 6.69l3.84 2.98C6.14 6.89 8.83 4.75 12 4.75Z" />
      </svg>
      {t("auth.continueWithGoogle")}
    </a>
  );
}
