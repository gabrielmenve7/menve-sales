import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
    image?: string | null;
  };

  return (
    <DashboardShell
      tenant={tenantForShell}
      isSuperAdmin={isSuperAdmin}
      researchEnabled={researchEnabled}
      userName={session.user.name}
      userEmail={session.user.email}
      userImage={session.user.image}
    >
      {children}
    </DashboardShell>
  );
}
