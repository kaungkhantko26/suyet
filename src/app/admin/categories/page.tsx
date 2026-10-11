import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { CategoryForm } from "@/components/admin/forms";
import { categoryOpAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Categories", robots: { index: false } };

export default async function AdminCategories() {
  await requirePermission("categories.manage", "/admin/categories");
  const t = await getT();
  const cats = await db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { events: true } } } });
  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.categories")}</h1>
      <Card className="p-5"><h2 className="mb-3 font-semibold">{t("common.create")}</h2><CategoryForm /></Card>
      <ul className="space-y-3">
        {cats.map((c, i) => (
          <li key={c.id}><Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{c.nameEn} <span className="text-sm font-normal text-muted">/{c.slug} · {c._count.events}</span></p>
              <div className="flex flex-wrap items-center gap-2">
                {!c.isActive && <Badge tone="warning">inactive</Badge>}
                <ActionButton label="↑" action={categoryOpAction} args={[c.id, "up"]} />
                <ActionButton label="↓" action={categoryOpAction} args={[c.id, "down"]} />
                <ActionButton label={c.isActive ? t("admin.suspend") : t("admin.reinstate")} variant={c.isActive ? "danger" : "outline"} action={categoryOpAction} args={[c.id, c.isActive ? "deactivate" : "activate"]} />
              </div>
            </div>
            <details><summary className="min-h-9 cursor-pointer text-sm font-medium">{t("common.edit")} · #{i + 1}</summary><div className="mt-3"><CategoryForm initial={{ id: c.id, nameEn: c.nameEn, nameMy: c.nameMy, icon: c.icon }} /></div></details>
          </Card></li>
        ))}
      </ul>
    </div>
  );
}
