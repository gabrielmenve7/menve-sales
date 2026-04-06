import { auth } from "@/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
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

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-background">
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        userName={session.user.name ?? session.user.email}
        researchEnabled={researchEnabled}
      />
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
