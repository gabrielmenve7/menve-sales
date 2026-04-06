import { auth } from "@/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTenantFromRequest } from "@/lib/tenant";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const researchEnabled =
    (tenant as { researchEnabled?: boolean }).researchEnabled !== false;

  const tenantForShell = tenant as {
    name: string;
    slug: string;
    plan: string;
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-background">
      <div className="flex h-full w-[13.5rem] shrink-0 flex-col border-r border-border/40 bg-sidebar dark:border-border/30">
        <div className="shrink-0 space-y-2 border-b border-border/40 px-2 pb-3 pt-3 dark:border-border/30">
          <WorkspaceSwitcher tenant={tenantForShell} className="w-full" />
          <div className="flex justify-end px-0.5">
            <ThemeToggle />
          </div>
        </div>
        <Sidebar
          isSuperAdmin={isSuperAdmin}
          userName={session.user.name ?? session.user.email}
          researchEnabled={researchEnabled}
        />
      </div>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30 p-4 md:p-5 dark:bg-muted/15">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/50 border-l-0 bg-card shadow-sm dark:border-border/40">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
