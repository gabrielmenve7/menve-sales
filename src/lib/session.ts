import { auth } from "@/auth";
import { getTenantFromRequest } from "@/lib/tenant";
import { UserRole } from "@prisma/client";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado");
  return session;
}

/** Tenant ativo no contexto (subdomínio/header). SUPER_ADMIN usa o tenant resolvido pelo host. */
export async function getActiveTenantId() {
  const session = await requireSession();
  const tenant = await getTenantFromRequest();
  if (!tenant) throw new Error("Tenant não encontrado");

  if (session.user.role === UserRole.SUPER_ADMIN) {
    return tenant.id;
  }

  if (!session.user.tenantId || session.user.tenantId !== tenant.id) {
    throw new Error("Sem permissão neste tenant");
  }

  return tenant.id;
}

export async function canAccessAdmin() {
  const session = await auth();
  return session?.user?.role === UserRole.SUPER_ADMIN;
}

/** Pode alterar pipeline, tags (catálogo), campos customizados e outras configs do tenant. */
export async function assertCanConfigureTenant() {
  const session = await requireSession();
  const role = session.user.role;
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
  if (!session?.user) return false;
  const role = session.user.role;
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER
  );
}
