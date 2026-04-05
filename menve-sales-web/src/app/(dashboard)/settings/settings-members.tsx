"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Member = { id: string; name: string | null; email: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Proprietário",
  ADMIN: "Admin",
  MANAGER: "Gestor",
  SELLER: "Vendedor",
};

export function SettingsMembers({ members }: { members: Member[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Membros</CardTitle>
        <CardDescription>
          Usuários com acesso a este workspace
        </CardDescription>
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
