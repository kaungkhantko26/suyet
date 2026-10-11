import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { EventGrid } from "@/components/events/event-grid";
import { Badge } from "@/components/ui/badge";
import { Container, EmptyState } from "@/components/ui/misc";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSavedIds } from "@/lib/events/lookups";
import { eventCardInclude, publicWhere } from "@/lib/events/queries";
import { isSafeExternalUrl } from "@/lib/url";
import { getT } from "@/i18n/server";

type Props = { params: Promise<{ slug: string }> };

const getOrg = (slug: string) => db.organizer.findFirst({ where: { slug, deletedAt: null, status: { not: "SUSPENDED" } } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await getOrg((await params).slug);
  return o ? { title: o.name, description: o.description ?? undefined, alternates: { canonical: `/organizers/${o.slug}` } } : {};
}

export default async function OrganizerPage({ params }: Props) {
  const { slug } = await params;
  const [t, user, org] = await Promise.all([getT(), getCurrentUser(), getOrg(slug)]);
  if (!org) notFound();
  const now = new Date();
  const [events, savedIds] = await Promise.all([
    db.event.findMany({ where: { ...publicWhere, organizerId: org.id }, include: eventCardInclude, orderBy: { startAt: "desc" }, take: 60 }),
    getSavedIds(user?.id),
  ]);
  const ended = (e: (typeof events)[number]) => (e.endAt ?? new Date(e.startAt.getTime() + 86_400_000)) < now;
  const upcoming = events.filter((e) => !ended(e)).reverse();
  const past = events.filter(ended);
  const link = (url: string | null, label: string) => url && isSafeExternalUrl(url) ? <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline underline-offset-4">{label}<ExternalLink className="size-3.5" aria-hidden="true" /></a> : null;
  return (
    <Container className="py-10 sm:py-14">
      <header className="mb-10 max-w-3xl">
        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{t(`organizers.types.${org.type}`)}</Badge>
          {org.status === "VERIFIED" ? <Badge tone="success"><BadgeCheck className="size-3" aria-hidden="true" />{t("verification.organizerVerified")}</Badge> : <Badge tone="neutral">{t("verification.organizerUnverified")}</Badge>}
        </div>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight sm:text-4xl">{org.name}</h1>
        {org.description && <p className="mt-3 text-muted">{org.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5">{link(org.website, t("organizers.website"))}{link(org.facebook, t("organizers.facebook"))}{link(org.telegram, t("organizers.telegram"))}</div>
      </header>
      <h2 className="mb-5 font-serif text-2xl font-medium">{t("organizers.upcoming")}</h2>
      {upcoming.length ? <EventGrid events={upcoming} t={t} savedIds={savedIds} authed={!!user} /> : <EmptyState title={t("organizers.noEvents")} />}
      {past.length > 0 && (<><h2 className="mt-14 mb-5 font-serif text-2xl font-medium">{t("organizers.past")}</h2><EventGrid events={past} t={t} savedIds={savedIds} authed={!!user} /></>)}
    </Container>
  );
}
