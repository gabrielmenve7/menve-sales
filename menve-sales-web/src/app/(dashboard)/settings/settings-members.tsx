"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  removeWorkspaceMember,
  sendWorkspaceInvite,
  updateWorkspaceMemberRole,
} from "@/actions/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = { id: string; name: string | null; email: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Proprietário",
  ADMIN: "Admin",
  MANAGER: "Gestor",
  SELLER: "Vendedor",
};

const INVITE_ROLES = ["SELLER", "MANAGER", "ADMIN"] as const;

export function SettingsMembers({
  tenantId,
  members,
  canInvite,
  canManageMembers = false,
}: {
  tenantId: string;
  members: Member[];
  canInvite: boolean;
  canManageMembers?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("SELLER");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);
    try {
      await sendWorkspaceInvite({ tenantId, email: email.trim(), role });
      setMsg("Convite enviado (verifique a caixa de entrada).");
      setEmail("");
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Falha ao convidar.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Convidar membro</CardTitle>
            <CardDescription>
              Enviamos um e-mail com link para a mesma tela de login. O convidado
              deve usar o e-mail indicado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="invite-email">E-mail</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="colega@empresa.com"
                  className="h-10"
                />
              </div>
              <div className="w-full space-y-2 sm:w-44">
                <Label htmlFor="invite-role">Papel</Label>
                <select
                  id="invite-role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as (typeof INVITE_ROLES)[number])
                  }
                >
                  <option value="SELLER">Vendedor</option>
                  <option value="MANAGER">Gestor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <Button type="submit" className="h-10 shrink-0" disabled={loading}>
                {loading ? "Enviando…" : "Convidar"}
              </Button>
            </form>
            {msg ? (
              <p className="mt-3 text-[13px] text-emerald-600 dark:text-emerald-400">
                {msg}
              </p>
            ) : null}
            {err ? (
              <p className="mt-3 text-[13px] text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Usuários com acesso a este workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro encontrado.</p>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {(m.name ?? m.email).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[11px]">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                  {canManageMembers && m.role !== "OWNER" && m.role !== "SUPER_ADMIN" ? (
                    <div className="flex items-center gap-1">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={m.role}
                        onChange={async (e) => {
                          try {
                            await updateWorkspaceMemberRole({
                              tenantId,
                              userId: m.id,
                              role: e.target.value as "ADMIN" | "MANAGER" | "SELLER",
                            });
                            router.refresh();
                          } catch (er) {
                            setErr(er instanceof Error ? er.message : "Erro ao atualizar papel");
                          }
                        }}
                      >
                        <option value="SELLER">Vendedor</option>
                        <option value="MANAGER">Gestor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive"
                        onClick={async () => {
                          if (!confirm(`Remover ${m.email}?`)) return;
                          try {
                            await removeWorkspaceMember({ tenantId, userId: m.id });
                            router.refresh();
                          } catch (er) {
                            setErr(er instanceof Error ? er.message : "Erro ao remover");
                          }
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
