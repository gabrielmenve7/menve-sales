import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";

export function assertCanConfigureTenant(role: UserRole) {
  const ok =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER;
  if (!ok) {
    throw new ForbiddenException(
      "Sem permissão para alterar configurações do CRM",
    );
  }
}

/** Nome do workspace e flags de produto (ex.: Pesquisa): Owner, Admin e plataforma. */
export function assertCanManageWorkspaceFeatures(role: UserRole) {
  const ok =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.ADMIN;
  if (!ok) {
    throw new ForbiddenException(
      "Sem permissão para alterar configurações do workspace",
    );
  }
}
