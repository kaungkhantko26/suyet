import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Container, EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { publicWhere } from "@/lib/events/queries";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("organizers.title"), description: t("organizers.description"), alternates: { canonical: "/organizers" } };
}

export default async function OrganizersPage() {
  const t = await getT();
  const orgs = await db.organizer.findMany({
    where: { deletedAt: null, status: { not: "SUSPENDED" }, events: { some: publicWhere } },
    include: { _count: { select: { events: { where: publicWhere } } }, location: true },
    orderBy: { name: "asc" },
  });
  return (
    <Container className="py-10 sm:py-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{t("organizers.title")}</h1>
        <p className="mt-2 text-muted">{t("organizers.description")}</p>
      </header>
      {orgs.length === 0 ? <EmptyState title={t("organizers.empty")} /> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((o) => (
            <li key={o.id}>
              <Card className="relative h-full p-5 transition-colors hover:border-fg/40">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone="outline">{t(`organizers.types.${o.type}`)}</Badge>
                </div>
                <h2 className="mt-4 flex items-center gap-1.5 text-lg font-semibold">
                  <Link href={`/organizers/${o.slug}`} className="after:absolute after:inset-0 after:content-['']">{o.name}</Link>
                  {o.status === "VERIFIED" && <BadgeCheck className="size-4 text-primary" aria-label={t("verification.organizerVerified")} />}
                </h2>
                {o.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{o.description}</p>}
                <p className="mt-4 text-sm text-muted">{t("common.resultsCount", { count: o._count.events })}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
