import { auth } from "@/auth";
import { getTenantFromRequest } from "@/lib/tenant";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado");
  return session;
}

/**
 * Se o JWT vier sem `role` (produção / cookie antigo), o SUPER_ADMIN com tenantId null
 * cairia na checagem errada e quebrava todas as abas. Recarrega do banco só quando necessário.
 */
async function resolveRoleAndTenantId(session: {
  user: {
    id: string;
    role: UserRole | null | undefined;
    tenantId: string | null | undefined;
  };
}) {
  let role = session.user.role;
  let tenantId = session.user.tenantId;
  const roleUnset =
    role == null || (typeof role === "string" && role.trim() === "");
  if (roleUnset) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, tenantId: true },
    });
    if (!u) redirect("/login");
    role = u.role;
    tenantId = u.tenantId;
  }
  return { role, tenantId };
}

/** Tenant ativo no contexto (subdomínio/header). SUPER_ADMIN usa o tenant resolvido pelo host. */
export async function getActiveTenantId() {
  const session = await requireSession();
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");

  const { role, tenantId: userTenantId } = await resolveRoleAndTenantId(session);

  if (role === UserRole.SUPER_ADMIN) {
    return tenant.id;
  }

  if (!userTenantId || userTenantId !== tenant.id) {
    redirect("/login?error=tenant");
  }

  return tenant.id;
}

export async function canAccessAdmin() {
  const session = await auth();
  if (!session?.user?.id) return false;
  const { role } = await resolveRoleAndTenantId({
    user: {
      id: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId,
    },
  });
  return role === UserRole.SUPER_ADMIN;
}

/** Pode alterar pipeline, tags (catálogo), campos customizados e outras configs do tenant. */
export async function assertCanConfigureTenant() {
  const session = await requireSession();
  const { role } = await resolveRoleAndTenantId(session);
  const ok =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER;
  if (!ok) {
    throw new Error("Sem permissão para alterar configurações do CRM");
  }
}

/** Para UI: quem pode criar/remover conexões WhatsApp e fluxos de pareamento. */
export async function canConfigureTenant() {
  const session = await auth();
  if (!session?.user?.id) return false;
  const { role } = await resolveRoleAndTenantId({
    user: {
      id: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId,
    },
  });
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER
  );
}
