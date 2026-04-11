import { UserRole, WorkspaceRole } from "@prisma/client";

export function workspaceRoleToUserRole(w: WorkspaceRole): UserRole {
  switch (w) {
    case WorkspaceRole.OWNER:
      return UserRole.OWNER;
    case WorkspaceRole.ADMIN:
      return UserRole.ADMIN;
    case WorkspaceRole.MANAGER:
      return UserRole.MANAGER;
    case WorkspaceRole.SELLER:
      return UserRole.SELLER;
    default:
      return UserRole.SELLER;
  }
}

export function userRoleToWorkspaceRole(r: UserRole): WorkspaceRole {
  switch (r) {
    case UserRole.OWNER:
      return WorkspaceRole.OWNER;
    case UserRole.ADMIN:
      return WorkspaceRole.ADMIN;
    case UserRole.MANAGER:
      return WorkspaceRole.MANAGER;
    case UserRole.SELLER:
      return WorkspaceRole.SELLER;
    case UserRole.SUPER_ADMIN:
      return WorkspaceRole.OWNER;
    default:
      return WorkspaceRole.SELLER;
  }
}
