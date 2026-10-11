import { Building2, CalendarPlus, LayoutDashboard, ListChecks } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireOrganizer } from "@/lib/auth/guards";
import { getT } from "@/i18n/server";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  await requireOrganizer("/organizer/dashboard");
  const t = await getT();
  return (
    <DashboardShell
      title={t("organizerArea.dashboard")}
      items={[
        { href: "/organizer/dashboard", label: t("organizerArea.dashboard"), icon: <LayoutDashboard />, exact: true },
        { href: "/organizer/events", label: t("organizerArea.myEvents"), icon: <ListChecks />, exact: true },
        { href: "/organizer/events/new", label: t("organizerArea.newEvent"), icon: <CalendarPlus /> },
        { href: "/organizer/profile", label: t("organizerArea.profile"), icon: <Building2 /> },
      ]}
    >{children}</DashboardShell>
  );
}
