import type { Metadata } from "next";
import { OrganizerVerifyForm, ReasonAction } from "@/components/admin/forms";
import { ActionButton } from "@/components/admin/action-button";
import { organizerOpAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { isSafeExternalUrl } from "@/lib/url";
import { ApplicationDecision } from "@/components/admin/application-decision";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Organizers", robots: { index: false } };

export default async function AdminOrganizers() {
  await requirePermission("organizers.manage", "/admin/organizers");
  const t = await getT();
  const [apps, orgs] = await Promise.all([
    db.organizerApplication.findMany({ where: { status: "PENDING" }, include: { user: { select: { name: true, email: true, emailVerified: true } } }, orderBy: { createdAt: "asc" } }),
    db.organizer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { events: true } } } }),
  ]);
  const link = (u: string | null) => u && isSafeExternalUrl(u) ? <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-4">{u}</a> : "—";
  return (
    <div className="space-y-10">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.organizers")}</h1>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("submit.becomeOrganizer")} ({apps.length})</h2>
        {apps.length === 0 && <p className="text-sm text-muted">{t("admin.nothingPending")}</p>}
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id}><Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{a.name}</h3><Badge tone="outline">{t(`organizers.types.${a.type}`)}</Badge></div>
              <p className="text-sm">{a.description}</p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">{t("common.email")}</dt><dd>{a.user.name} · {a.user.email} {a.user.emailVerified ? "✓" : `(${t("verification.UNVERIFIED")})`}</dd></div>
                <div><dt className="text-muted">{t("submit.orgEmail")}</dt><dd>{a.contactEmail}</dd></div>
                <div><dt className="text-muted">{t("submit.orgWebsite")}</dt><dd>{link(a.website)}</dd></div>
                <div><dt className="text-muted">{t("submit.orgEvidence")}</dt><dd>{link(a.evidenceUrl)}</dd></div>
              </dl>
              <ApplicationDecision id={a.id} />
            </Card></li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("admin.organizers")}</h2>
        <ul className="space-y-3">
          {orgs.map((o) => (
            <li key={o.id}><Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold">{o.name}</p><p className="text-sm text-muted">{t(`organizers.types.${o.type}`)} · {o._count.events} · {formatDate(o.createdAt, t.locale)}</p></div>
                <Badge tone={o.status === "VERIFIED" ? "success" : o.status === "SUSPENDED" ? "error" : "neutral"}>{o.status}</Badge>
              </div>
              {o.verificationMethod && <p className="mt-2 text-sm text-muted">Verified {o.verifiedAt ? formatDate(o.verifiedAt, t.locale) : ""} · {o.verificationMethod.replaceAll("_", " ").toLowerCase()} · {o.verificationEvidence}</p>}
              <div className="mt-3 space-y-3">
                {o.status !== "VERIFIED" && o.status !== "SUSPENDED" && <OrganizerVerifyForm id={o.id} />}
                {o.status === "VERIFIED" && <ReasonAction id={o.id} op="revoke" label={t("admin.unverify")} />}
                {o.status !== "SUSPENDED" ? <ReasonAction id={o.id} op="suspend" label={t("admin.suspend")} variant="danger" /> : <ActionButton label={t("admin.reinstate")} action={organizerOpAction} args={[o.id, "reinstate"]} />}
              </div>
            </Card></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
