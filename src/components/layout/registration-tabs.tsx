import Link from "next/link";
import { cn } from "@/lib/cn";

export function RegistrationTabs({ eventId, active, formLabel, responsesLabel, responseCount }: {
  eventId: string; active: "form" | "responses"; formLabel: string; responsesLabel: string; responseCount: number;
}) {
  const tab = (on: boolean) => cn("flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-sm font-medium", on ? "bg-fg text-bg" : "text-muted hover:text-fg");
  return (
    <div role="tablist" className="mb-8 flex max-w-sm gap-1 rounded-[10px] border border-border bg-surface-2 p-1">
      <Link role="tab" aria-selected={active === "form"} href={`/organizer/events/${eventId}/registration`} className={tab(active === "form")}>{formLabel}</Link>
      <Link role="tab" aria-selected={active === "responses"} href={`/organizer/events/${eventId}/registration/responses`} className={tab(active === "responses")}>
        {responsesLabel}{responseCount > 0 && <span className="rounded-full bg-fg/10 px-1.5 text-xs tabular-nums">{responseCount}</span>}
      </Link>
    </div>
  );
}
