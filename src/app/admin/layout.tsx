import { BarChart3, Bot, Building2, CalendarDays, ClipboardCheck, Flag, Globe, LayoutDashboard, Settings, ShieldAlert, Tags, Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requirePermission } from "@/lib/auth/guards";
import { can, type Permission } from "@/lib/auth/permissions";
import { getT } from "@/i18n/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("admin.access", "/admin");
  const t = await getT();
  const all: { href: string; label: string; icon: React.ReactNode; exact?: boolean; perm: Permission }[] = [
    { href: "/admin", label: t("admin.overview"), icon: <LayoutDashboard />, exact: true, perm: "admin.access" },
    { href: "/admin/events", label: t("admin.events"), icon: <CalendarDays />, perm: "review.verify" },
    { href: "/admin/submissions", label: t("admin.submissions"), icon: <ClipboardCheck />, perm: "review.submissions" },
    { href: "/admin/organizers", label: t("admin.organizers"), icon: <Building2 />, perm: "organizers.manage" },
    { href: "/admin/users", label: user.role === "SUPER_ADMIN" ? "Users & privileged roles" : t("admin.users"), icon: <Users />, perm: "users.view" },
    { href: "/admin/categories", label: t("admin.categories"), icon: <Tags />, perm: "categories.manage" },
    { href: "/admin/reports", label: t("admin.reports"), icon: <Flag />, perm: "review.reports" },
    { href: "/admin/sources", label: t("admin.sources"), icon: <Globe />, perm: "sources.manage" },
    { href: "/admin/automation", label: t("admin.automation"), icon: <Bot />, perm: "review.candidates" },
    { href: "/admin/security", label: t("admin.security"), icon: <ShieldAlert />, perm: "security.view" },
    { href: "/admin/analytics", label: t("admin.analytics"), icon: <BarChart3 />, perm: "analytics.view" },
    { href: "/admin/settings", label: t("admin.settings"), icon: <Settings />, perm: "settings.view" },
  ];
  return <DashboardShell title={t("admin.title")} items={all.filter((i) => can(user.role, i.perm)).map(({ perm: _p, ...i }) => i)}>{children}</DashboardShell>;
}
