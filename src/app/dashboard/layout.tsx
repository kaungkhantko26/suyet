import { Bell, Bookmark, ClipboardList, LayoutDashboard, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { getT } from "@/i18n/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/dashboard");
  const t = await getT();
  return (
    <DashboardShell
      title={t("nav.dashboard")}
      items={[
        { href: "/dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard />, exact: true },
        { href: "/dashboard/saved", label: t("dashboard.saved"), icon: <Bookmark /> },
        { href: "/dashboard/registrations", label: t("registration.myTitle"), icon: <ClipboardList /> },
        { href: "/dashboard/notifications", label: t("dashboard.notifications"), icon: <Bell /> },
        { href: "/dashboard/preferences", label: t("dashboard.preferences"), icon: <SlidersHorizontal /> },
        { href: "/dashboard/profile", label: t("dashboard.profile"), icon: <UserRound /> },
        { href: "/dashboard/security", label: t("securityPage.title"), icon: <ShieldCheck /> },
      ]}
    >{children}</DashboardShell>
  );
}
