import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { markNotificationsReadAction } from "@/app/actions/student";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const t = await getT();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t("dashboard.notifications")}</h1>
        {items.some((n) => !n.readAt) && <form action={markNotificationsReadAction}><Button type="submit" variant="outline">{t("dashboard.markRead")}</Button></form>}
      </div>
      {items.length === 0 ? <EmptyState title={t("dashboard.emptyNotifications")} /> : (
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-4 py-4">
              <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
              <div><Link href={n.body.replace(/^https?:\/\/[^/]+/, "")} className={`underline-offset-4 hover:underline ${n.readAt ? "" : "font-semibold"}`}>{n.title}</Link><p className="mt-0.5 text-xs text-muted">{formatDateTime(n.createdAt, t.locale)}{!n.readAt && <span className="sr-only"> (unread)</span>}</p></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
