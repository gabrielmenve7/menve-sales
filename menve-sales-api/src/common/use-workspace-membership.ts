/** Quando true, acesso por WorkspaceMembership + JWT com workspaceRole; quando false, legado User.tenantId. */
export function useWorkspaceMembership(): boolean {
  const v = process.env.USE_WORKSPACE_MEMBERSHIP?.trim().toLowerCase();
  return v === "true" || v === "1";
}
