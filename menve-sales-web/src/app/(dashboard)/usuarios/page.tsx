import { apiServer } from "@/lib/api-server";
import { assertCanManageWorkspaceFeatures } from "@/lib/session";
import { getTenantFromRequest } from "@/lib/tenant";
import { SettingsMembers } from "../settings/settings-members";
import { redirect } from "next/navigation";

type Member = { id: string; name: string | null; email: string; role: string };

export default async function UsuariosPage() {
  await assertCanManageWorkspaceFeatures();
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");

  const data = await apiServer<{ members: Member[] }>("/settings");
  const members = (data.members ?? []) as Member[];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Membros do workspace e convites
          </p>
        </div>
        <SettingsMembers
          tenantId={tenant.id}
          members={members}
          canInvite={true}
          canManageMembers={true}
        />
      </div>
    </div>
  );
}
