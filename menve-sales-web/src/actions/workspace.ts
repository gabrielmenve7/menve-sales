"use server";

import { auth } from "@/auth";
import type { UserRole } from "@/types/domain";

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
  role: UserRole;
};

export type LoginLikeResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    image?: string | null;
    role: UserRole;
    tenantId: string | null;
    globalRole?: UserRole;
    workspaceRole?: string | null;
  };
  workspaces: WorkspaceListItem[];
  needsOnboarding: boolean;
};

export async function switchWorkspace(tenantId: string): Promise<LoginLikeResponse> {
  const session = await auth();
  const token = session?.user?.accessToken;
  if (!token) throw new Error("Não autenticado");

  const r = await fetch(`${apiBase()}/auth/active-workspace`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenantId }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao trocar workspace");
  }
  return (await r.json()) as LoginLikeResponse;
}

export async function createFirstWorkspace(input: {
  name: string;
  slug?: string;
}): Promise<LoginLikeResponse> {
  const session = await auth();
  const token = session?.user?.accessToken;
  if (!token) throw new Error("Não autenticado");

  const r = await fetch(`${apiBase()}/workspaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.name, slug: input.slug }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao criar workspace");
  }
  const created = (await r.json()) as { id: string };
  return switchWorkspace(created.id);
}

export async function acceptWorkspaceInvite(
  token: string,
): Promise<LoginLikeResponse> {
  const session = await auth();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) throw new Error("Não autenticado");

  const r = await fetch(`${apiBase()}/workspaces/invites/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao aceitar convite");
  }
  const { tenantId } = (await r.json()) as { tenantId: string };
  return switchWorkspace(tenantId);
}

export async function sendWorkspaceInvite(input: {
  tenantId: string;
  email: string;
  role?: "OWNER" | "ADMIN" | "MANAGER" | "SELLER";
}): Promise<{ ok: boolean }> {
  const session = await auth();
  const token = session?.user?.accessToken;
  if (!session?.user?.id || !token) throw new Error("Não autenticado");

  const r = await fetch(
    `${apiBase()}/workspaces/${encodeURIComponent(input.tenantId)}/invites`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-tenant-id": input.tenantId,
      },
      body: JSON.stringify({
        email: input.email,
        role: input.role,
      }),
      cache: "no-store",
    },
  );
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao enviar convite");
  }
  return { ok: true };
}

export async function updateWorkspaceMemberRole(input: {
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "SELLER";
}): Promise<{ ok: boolean }> {
  const session = await auth();
  const token = session?.user?.accessToken;
  if (!session?.user?.id || !token) throw new Error("Não autenticado");

  const r = await fetch(
    `${apiBase()}/workspaces/${encodeURIComponent(input.tenantId)}/members/${encodeURIComponent(input.userId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-tenant-id": input.tenantId,
      },
      body: JSON.stringify({ role: input.role }),
      cache: "no-store",
    },
  );
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao atualizar papel");
  }
  return { ok: true };
}

export async function removeWorkspaceMember(input: {
  tenantId: string;
  userId: string;
}): Promise<{ ok: boolean }> {
  const session = await auth();
  const token = session?.user?.accessToken;
  if (!session?.user?.id || !token) throw new Error("Não autenticado");

  const r = await fetch(
    `${apiBase()}/workspaces/${encodeURIComponent(input.tenantId)}/members/${encodeURIComponent(input.userId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-tenant-id": input.tenantId,
      },
      cache: "no-store",
    },
  );
  if (!r.ok) {
    throw new Error((await r.text()) || "Falha ao remover membro");
  }
  return { ok: true };
}
