"use client";

import type { Activity, Contact, Deal, User } from "@prisma/client";
import { ActivityType } from "@prisma/client";
import { useState } from "react";
import { createActivity, completeActivity } from "@/actions/activities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = Activity & {
  contact: Contact | null;
  deal: Deal | null;
  user: User;
};

const types: ActivityType[] = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.MEETING,
  ActivityType.TASK,
  ActivityType.NOTE,
  ActivityType.WHATSAPP,
];

export function ActivitiesClient({ activities }: { activities: Row[] }) {
  const [loading, setLoading] = useState(false);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await createActivity({
      title: String(fd.get("title") ?? ""),
      type: fd.get("type") as ActivityType,
      dueAt: String(fd.get("dueAt") ?? "") || undefined,
      description: String(fd.get("description") ?? "") || undefined,
    });
    setLoading(false);
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Nova atividade</CardTitle>
          <CardDescription>Ligação, reunião, tarefa ou nota</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" required />
              </div>
              <div>
                <Label htmlFor="type">Tipo</Label>
                <select
                  id="type"
                  name="type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  defaultValue={ActivityType.TASK}
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="dueAt">Prazo</Label>
                <Input id="dueAt" name="dueAt" type="datetime-local" />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                name="description"
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={loading}>
              Criar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {activities.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    <Badge variant="secondary">{a.type}</Badge>
                    {a.completedAt ? (
                      <Badge variant="outline">Concluída</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.user.name ?? a.user.email}
                    {a.contact ? ` · ${a.contact.name}` : ""}
                    {a.deal ? ` · ${a.deal.title}` : ""}
                  </p>
                  {a.dueAt ? (
                    <p className="text-xs text-muted-foreground">
                      Prazo: {new Date(a.dueAt).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                </div>
                {!a.completedAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => completeActivity(a.id)}
                  >
                    Concluir
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
