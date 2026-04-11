import { auth } from "@/auth";
import { getTenantFromRequest } from "@/lib/tenant";
import type { UserRole } from "@/types/domain";
import { redirect } from "next/navigation";

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

function internalKey() {
  return process.env.INTERNAL_API_KEY?.trim() ?? "";
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado");
  return session;
}

type ResolveRoleMode = "redirect" | "throw";

async function resolveRoleAndTenantId(
  session: {
    user: {
      id: string;
      role: UserRole | null | undefined;
      tenantId: string | null | undefined;
    };
  },
  mode: ResolveRoleMode = "redirect",
) {
  let role = session.user.role;
  let tenantId = session.user.tenantId;
  const roleUnset =
    role == null || (typeof role === "string" && role.trim() === "");
  if (roleUnset) {
    const key = internalKey();
    if (!key) {
      if (mode === "throw") {
        throw new Error(
          "INTERNAL_API_KEY não definido no servidor Next (Vercel). Defina a mesma chave da API Railway.",
        );
      }
      redirect("/login");
    }
    const r = await fetch(`${apiBase()}/auth/profile`, {
      headers: {
        "x-api-key": key,
        "x-user-id": session.user.id,
      },
      cache: "no-store",
    });
    if (!r.ok) {
      if (mode === "throw") {
        const snippet = await r.text().catch(() => "");
        throw new Error(
          `Não foi possível carregar o perfil (HTTP ${r.status}). Confira INTERNAL_API_URL e INTERNAL_API_KEY na Vercel. ${snippet.slice(0, 200)}`,
        );
      }
      redirect("/login");
    }
    const u = (await r.json()) as { role: UserRole; tenantId: string | null };
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

  if (role === "SUPER_ADMIN") {
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
  return role === "SUPER_ADMIN";
}

export async function assertCanConfigureTenant() {
  const session = await requireSession();
  const { role } = await resolveRoleAndTenantId(session, "redirect");
  const ok =
    role === "SUPER_ADMIN" ||
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "MANAGER";
  if (!ok) {
    throw new Error("Sem permissão para alterar configurações do CRM");
  }
}

/**
 * Mesma regra de `assertCanConfigureTenant`, mas para Route Handlers (`app/api/...`):
 * nunca chama `redirect()` (que não pode ir dentro de try/catch e vira erro genérico / “digest” no cliente).
 */
export async function assertCanConfigureTenantApiRoute() {
  const session = await requireSession();
  const { role } = await resolveRoleAndTenantId(session, "throw");
  const ok =
    role === "SUPER_ADMIN" ||
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "MANAGER";
  if (!ok) {
    throw new Error("Sem permissão para alterar configurações do CRM");
  }
}

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
    role === "SUPER_ADMIN" ||
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "MANAGER"
  );
}

export async function canManageWorkspaceFeatures() {
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
    role === "SUPER_ADMIN" ||
    role === "OWNER" ||
    role === "ADMIN"
  );
}

export async function assertCanManageWorkspaceFeatures() {
  const session = await requireSession();
  const { role } = await resolveRoleAndTenantId(session);
  const ok =
    role === "SUPER_ADMIN" ||
    role === "OWNER" ||
    role === "ADMIN";
  if (!ok) {
    throw new Error("Sem permissão para alterar configurações do workspace");
  }
}
