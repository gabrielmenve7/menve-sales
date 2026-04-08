import type { UserRole } from "@prisma/client";

/** Authenticated request context (JWT or internal API key). */
export interface RequestUser {
  userId: string;
  role: UserRole;
  /** User's home tenant (null for SUPER_ADMIN). */
  userTenantId: string | null;
  /** Active tenant for this request (from x-tenant-id or JWT for non-internal). */
  tenantId: string;
}
