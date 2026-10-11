import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { can, canAssignRole, canModerateUser } from "@/lib/auth/permissions";
import { RoleSelect } from "@/components/admin/forms";
import { userOpAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Users", robots: { index: false } };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requirePermission("users.view", "/admin/users");
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const users = await db.user.findMany({
    where: { deletedAt: null, ...(sp.q ? { OR: [{ email: { contains: sp.q.slice(0, 100), mode: "insensitive" } }, { name: { contains: sp.q.slice(0, 100), mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{t("admin.users")}</h1>
      <form role="search"><input name="q" defaultValue={sp.q} placeholder={t("common.search")} aria-label={t("common.search")} className="min-h-11 w-full max-w-sm rounded-[10px] border border-border bg-surface px-3 text-sm" /></form>
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-semibold">{u.name}{u.id === admin.id && <span className="ml-2 text-xs text-muted">(you)</span>}</p><p className="truncate text-sm text-muted">{u.email} · {formatDate(u.createdAt, t.locale)}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {u.status === "SUSPENDED" && <Badge tone="error">SUSPENDED</Badge>}
              {can(admin.role, "users.manage") && canAssignRole(admin, u, "STUDENT") && <RoleSelect userId={u.id} role={u.role} options={admin.role === "SUPER_ADMIN" ? ["STUDENT", "ORGANIZER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] : ["STUDENT", "ORGANIZER"]} />}
              {!(can(admin.role, "users.manage") && canAssignRole(admin, u, "STUDENT")) && <Badge tone="outline">{u.role}</Badge>}
              {can(admin.role, "users.manage") && canModerateUser(admin, u) && (u.status === "ACTIVE" ? <ActionButton variant="danger" label={t("admin.suspend")} confirm={`${t("admin.suspend")}?`} action={userOpAction} args={[u.id, "suspend"]} /> : <ActionButton label={t("admin.reinstate")} action={userOpAction} args={[u.id, "reinstate"]} />)}
            </div>
          </Card></li>
        ))}
      </ul>
    </div>
  );
}
