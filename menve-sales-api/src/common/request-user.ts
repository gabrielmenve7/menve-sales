import type { UserRole } from "@prisma/client";

/** Authenticated request context (JWT or internal API key). */
export interface RequestUser {
  userId: string;
  /** Papel global da tabela User (ex.: SUPER_ADMIN). */
  globalRole: UserRole;
  /**
   * Papel efetivo no tenant ativo (membership ou legado).
   * Use em assertCanConfigureTenant / RBAC de workspace.
   */
  role: UserRole;
  /** Legado: User.tenantId (home tenant). */
  userTenantId: string | null;
  /** Active tenant for this request (from x-tenant-id or JWT for non-internal). */
  tenantId: string;
}
