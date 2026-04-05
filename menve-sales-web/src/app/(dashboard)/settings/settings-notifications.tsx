"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell } from "lucide-react";

export function SettingsNotifications() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
        <CardDescription>
          Configure como você recebe alertas de novas mensagens e atividades
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Bell className="size-10 text-muted-foreground/50" strokeWidth={1.5} />
          <div>
            <p className="font-medium">Em breve</p>
            <p className="text-sm text-muted-foreground">
              Estamos trabalhando nas configurações de notificações.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
