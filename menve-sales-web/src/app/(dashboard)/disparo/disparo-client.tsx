"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOutreachCampaign,
  listOutreachCampaigns,
  pauseOutreachCampaign,
  startOutreachCampaign,
  type OutreachCampaignStatus,
  type OutreachCampaignSummary,
} from "@/actions/outreach";
import type { ProspectListSummary } from "@/actions/prospect-lists";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WhatsAppConnection } from "@prisma/client";
import { Loader2, Pause, Play, Plus, Send } from "lucide-react";

const STATUS_LABELS: Record<OutreachCampaignStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em envio",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const DEFAULT_TEMPLATE = `Olá {{nome}}! Tudo bem?

Somos da Menve e vimos a {{empresa}}. Podemos conversar?

WhatsApp: {{telefone}}`;

const WIZARD_STEPS = ["Lista", "Conexão", "Template", "Iniciar"] as const;

export function DisparoClient({
  initialCampaigns,
  prospectLists,
  connections,
}: {
  initialCampaigns: OutreachCampaignSummary[];
  prospectLists: ProspectListSummary[];
  connections: WhatsAppConnection[];
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATE);

  function resetWizard() {
    setStep(0);
    setName("");
    setListId("");
    setConnectionId("");
    setTemplateBody(DEFAULT_TEMPLATE);
    setError(null);
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  const selectedList = prospectLists.find((l) => l.id === listId);
  const selectedConn = connections.find((c) => c.id === connectionId);

  async function refreshCampaigns() {
    const rows = await listOutreachCampaigns();
    setCampaigns(rows);
    router.refresh();
  }

  async function onCreateAndMaybeStart(start: boolean) {
    setBusy(true);
    setError(null);
    try {
      const campaign = await createOutreachCampaign({
        name: name.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        listId,
        connectionId,
        templateBody,
      });
      if (start) {
        await startOutreachCampaign(campaign.id);
      }
      setWizardOpen(false);
      await refreshCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar campanha");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleCampaign(
    id: string,
    status: OutreachCampaignStatus,
  ) {
    setActionId(id);
    try {
      if (status === "RUNNING") {
        await pauseOutreachCampaign(id);
      } else {
        await startOutreachCampaign(id);
      }
      await refreshCampaigns();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha na ação");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Disparo</h1>
          <p className="text-sm text-muted-foreground">
            Campanhas de WhatsApp a partir das suas listas de prospecção
          </p>
        </div>
        <Button type="button" onClick={openWizard} disabled={prospectLists.length === 0}>
          <Plus className="size-4" />
          <span className="ml-2">Nova campanha</span>
        </Button>
      </div>

      {prospectLists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Crie uma lista em{" "}
          <a href="/lista" className="font-medium text-foreground underline">
            Lista
          </a>{" "}
          antes de disparar mensagens.
        </p>
      ) : null}

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Send className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhuma campanha ainda. Crie a primeira para enviar mensagens em
              lote.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <Badge variant="secondary">{STATUS_LABELS[c.status]}</Badge>
                </div>
                <CardDescription>
                  {c.list?.name ?? "Sem lista"} · {c.connection?.name ?? "—"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{c.stats.total} destinatários</span>
                  <span>{c.stats.sent} enviados</span>
                  <span>{c.stats.replied} respostas</span>
                  {c.stats.failed > 0 ? (
                    <span className="text-destructive">{c.stats.failed} falhas</span>
                  ) : null}
                </div>
                {(c.status === "RUNNING" || c.status === "PAUSED" || c.status === "DRAFT") && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionId === c.id}
                    onClick={() => void onToggleCampaign(c.id, c.status)}
                  >
                    {actionId === c.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : c.status === "RUNNING" ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    <span className="ml-2">
                      {c.status === "RUNNING" ? "Pausar" : "Iniciar"}
                    </span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) resetWizard();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1">
            {WIZARD_STEPS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-center text-[11px]",
                  i === step
                    ? "bg-primary-solid text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {step === 0 ? (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="camp-name">Nome da campanha</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Clínicas SP — março"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="camp-list">Lista de prospects</Label>
                <select
                  id="camp-list"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {prospectLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.itemCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Escolha o número WhatsApp que enviará as mensagens.
              </p>
              {connections.length === 0 ? (
                <p className="text-sm text-destructive">
                  Nenhuma conexão ativa. Configure em{" "}
                  <a href="/whatsapps" className="underline">
                    WhatsApps
                  </a>
                  .
                </p>
              ) : (
                <div className="space-y-2">
                  {connections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/40",
                        connectionId === c.id && "border-primary ring-1 ring-primary",
                      )}
                      onClick={() => setConnectionId(c.id)}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.provider}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{{nome}}"}, {"{{empresa}}"}, {"{{telefone}}"}
              </p>
              <textarea
                className="min-h-[160px] w-full rounded-md border border-border bg-background p-3 text-sm"
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
              />
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Prévia
                  </CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap pb-3 text-sm">
                  {templateBody
                    .replace(/\{\{nome\}\}/gi, "Maria")
                    .replace(/\{\{empresa\}\}/gi, "Empresa Exemplo")
                    .replace(/\{\{telefone\}\}/gi, "(48) 99999-0000")}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Lista:</strong> {selectedList?.name} (
                {selectedList?.itemCount} contatos)
              </p>
              <p>
                <strong>Conexão:</strong> {selectedConn?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                O envio respeita o throttle configurado no workspace (padrão 1
                msg / 45s). Destinatários podem responder SAIR para opt-out.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => s - 1)}
            >
              Voltar
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                disabled={
                  busy ||
                  (step === 0 && !listId) ||
                  (step === 1 && !connectionId) ||
                  (step === 2 && !templateBody.trim())
                }
                onClick={() => setStep((s) => s + 1)}
              >
                Próximo
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onCreateAndMaybeStart(false)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span className={busy ? "ml-2" : ""}>Salvar rascunho</span>
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void onCreateAndMaybeStart(true)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span className={busy ? "ml-2" : ""}>Iniciar envio</span>
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
