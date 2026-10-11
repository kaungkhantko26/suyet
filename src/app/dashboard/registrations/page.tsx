import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { WithdrawButton } from "@/components/forms/withdraw-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { myRegistrations } from "@/lib/services/registrations";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "My registrations", robots: { index: false } };

export default async function MyRegistrationsPage() {
  const user = await requireUser("/dashboard/registrations");
  const [t, rows] = await Promise.all([getT(), myRegistrations(user.id)]);
  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{t("registration.myTitle")}</h1>
      {rows.length === 0 ? <EmptyState icon={<ClipboardList className="size-10" aria-hidden="true" />} title={t("registration.none")} action={<ButtonLink href="/events">{t("nav.explore")}</ButtonLink>} /> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface p-4">
              <div><Link href={`/events/${r.event.slug}`} className="font-semibold underline-offset-4 hover:underline">{r.event.title}</Link><p className="text-sm text-muted">{formatDate(r.event.startAt, t.locale)}</p></div>
              <div className="flex flex-wrap items-center gap-2"><Badge tone={({ SUBMITTED: "warning", APPROVED: "success", REJECTED: "error", WITHDRAWN: "outline" } as const)[r.status]}>{t(`registration.studentStatus.${r.status}`)}</Badge>{(r.status === "SUBMITTED" || r.status === "APPROVED") && <WithdrawButton eventId={r.eventId} />}</div>
              {r.status === "APPROVED" && <p className="basis-full text-sm text-success">{t("registration.approvedHint")}</p>}
              {r.status === "SUBMITTED" && <p className="basis-full text-sm text-muted">{t("registration.pendingHint")}</p>}
              {r.decisionNote && (r.status === "APPROVED" || r.status === "REJECTED") && <p className="basis-full rounded-[10px] bg-surface-2 px-3 py-2 text-sm"><span className="font-medium">{r.event.organizer.name}:</span> {r.decisionNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
