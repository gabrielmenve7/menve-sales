"use client";

import type {
  CustomField,
  Pipeline,
  QuickReply,
  Stage,
  Tag,
  WhatsAppConnection,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createQuickReply, deleteQuickReply } from "@/actions/quick-replies";
import { SettingsPipelineStages } from "./settings-pipeline-stages";
import { SettingsTagsCatalog } from "./settings-tags-catalog";
import { SettingsCustomFields } from "./settings-custom-fields";
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

export function SettingsClient({
  connections,
  quickReplies,
  appBaseUrl,
  pipelines,
  tags,
  contactCustomFields,
}: {
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  appBaseUrl: string;
  pipelines: (Pipeline & { stages: Stage[] })[];
  tags: Tag[];
  contactCustomFields: CustomField[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    try {
      await createQuickReply({ title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsPipelineStages pipelines={pipelines} />
      <SettingsTagsCatalog tags={tags} />
      <SettingsCustomFields fields={contactCustomFields} />
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp — Webhooks</CardTitle>
          <CardDescription>
            Configure Evolution API ou Meta Cloud API. URLs de webhook por conexão:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {connections.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma conexão. Crie via seed ou API admin.
            </p>
          ) : (
            connections.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="font-medium">
                  {c.name} — {c.provider}
                </p>
                {c.provider === "EVOLUTION" ? (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    POST{" "}
                    <code>
                      {appBaseUrl}/api/webhooks/whatsapp/evolution/{c.id}
                    </code>
                  </p>
                ) : (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Meta: configure o callback{" "}
                    <code>{appBaseUrl}/api/webhooks/whatsapp/meta</code> no app
                    da Meta + verify token.
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respostas rápidas (Inbox)</CardTitle>
          <CardDescription>
            Atalhos no WhatsApp Inbox para preencher mensagens comuns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="qr-title">Título do botão</Label>
                <Input
                  id="qr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Saudação"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="qr-body">Texto da mensagem</Label>
              <textarea
                id="qr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Texto enviado ao clicar no atalho…"
              />
            </div>
            <Button type="submit" disabled={loading || !title.trim() || !body.trim()}>
              {loading ? "Salvando…" : "Adicionar resposta rápida"}
            </Button>
          </form>

          <div>
            <p className="mb-2 text-sm font-medium">Cadastradas</p>
            {quickReplies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
            ) : (
              <ul className="space-y-2">
                {quickReplies.map((q) => (
                  <li
                    key={q.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{q.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {q.body}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive"
                      onClick={async () => {
                        if (!confirm("Remover esta resposta rápida?")) return;
                        setLoading(true);
                        try {
                          await deleteQuickReply(q.id);
                          router.refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Excluir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
