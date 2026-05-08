import { getSessionCached } from "@/lib/get-session-cached";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { fetchAuthMeForWebSession } from "@/lib/fetch-user-workspaces";
import { getTenantFromRequest } from "@/lib/tenant";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionCached();
  if (!session?.user) redirect("/login");

  if (
    session.user.needsOnboarding &&
    !session.user.tenantId
  ) {
    redirect("/workspace");
  }

  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");

  const isSuperAdmin =
    (session.user.globalRole ?? session.user.role) === "SUPER_ADMIN";
  const researchEnabled =
    (tenant as { researchEnabled?: boolean }).researchEnabled !== false;

  const tenantForShell = tenant as {
    id: string;
    name: string;
    slug: string;
    plan: string;
    image?: string | null;
  };

  const me = session.user.accessToken?.trim()
    ? await fetchAuthMeForWebSession(session.user.accessToken)
    : null;

  return (
    <DashboardShell
      tenant={tenantForShell}
      workspaces={me?.workspaces?.length ? me.workspaces : []}
      isSuperAdmin={isSuperAdmin}
      researchEnabled={researchEnabled}
      userName={me?.name ?? session.user.name}
      userEmail={me?.email ?? session.user.email ?? ""}
      userImage={me?.image ?? session.user.image}
    >
      {children}
    </DashboardShell>
  );
}
