"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOutreachCampaign,
  listOutreachCampaigns,
  pauseOutreachCampaign,
  saveOutreachDefaultTemplate,
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
import {
  DEFAULT_OUTREACH_TEMPLATE,
  previewOutreachTemplate,
} from "@/lib/outreach-template";
import { cn } from "@/lib/utils";
import type { WhatsAppConnection } from "@prisma/client";
import { FileText, Loader2, Pause, Play, Plus, Send } from "lucide-react";

const STATUS_LABELS: Record<OutreachCampaignStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em envio",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const WIZARD_STEPS = ["Lista", "Conexão", "Iniciar"] as const;

function TemplateEditor({
  templateBody,
  onChange,
}: {
  templateBody: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Variáveis: {"{{nome}}"}, {"{{empresa}}"}, {"{{telefone}}"}
      </p>
      <textarea
        className="min-h-[160px] w-full rounded-md border border-border bg-background p-3 text-sm"
        value={templateBody}
        onChange={(e) => onChange(e.target.value)}
      />
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Prévia
          </CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap pb-3 text-sm">
          {previewOutreachTemplate(templateBody)}
        </CardContent>
      </Card>
    </div>
  );
}

export function DisparoClient({
  initialCampaigns,
  primaryList,
  connections,
  initialTemplate,
}: {
  initialCampaigns: OutreachCampaignSummary[];
  primaryList: ProspectListSummary | null;
  connections: WhatsAppConnection[];
  initialTemplate: string;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [listId, setListId] = useState(primaryList?.id ?? "");
  const [connectionId, setConnectionId] = useState("");
  const [templateBody, setTemplateBody] = useState(
    initialTemplate || DEFAULT_OUTREACH_TEMPLATE,
  );
  const [templateDraft, setTemplateDraft] = useState(templateBody);

  function resetWizard() {
    setStep(0);
    setName("");
    setListId(primaryList?.id ?? "");
    setConnectionId("");
    setError(null);
  }

  function openWizard() {
    resetWizard();
    setListId(primaryList?.id ?? "");
    setWizardOpen(true);
  }

  function openTemplateDialog() {
    setTemplateError(null);
    setTemplateDraft(templateBody);
    setTemplateOpen(true);
  }

  const selectedList = primaryList;
  const selectedConn = connections.find((c) => c.id === connectionId);

  async function refreshCampaigns() {
    const rows = await listOutreachCampaigns();
    setCampaigns(rows);
    router.refresh();
  }

  async function onSaveTemplate() {
    const body = templateDraft.trim();
    if (!body) {
      setTemplateError("A mensagem não pode ficar vazia.");
      return;
    }
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      const saved = await saveOutreachDefaultTemplate(body);
      setTemplateBody(saved.templateBody);
      setTemplateOpen(false);
      router.refresh();
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Falha ao salvar template");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function onCreateAndMaybeStart(start: boolean) {
    const body = templateBody.trim();
    if (!body) {
      setError("Configure o template de mensagem antes de criar a campanha.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const campaign = await createOutreachCampaign({
        name: name.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        listId: primaryList?.id ?? listId,
        connectionId,
        templateBody: body,
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openTemplateDialog}>
            <FileText className="size-4" />
            <span className="ml-2">Template</span>
          </Button>
          <Button type="button" onClick={openWizard} disabled={!primaryList?.id}>
            <Plus className="size-4" />
            <span className="ml-2">Nova campanha</span>
          </Button>
        </div>
      </div>

      {!primaryList ? (
        <p className="text-sm text-muted-foreground">
          Faça uma captura em{" "}
          <a href="/lista" className="font-medium text-foreground underline">
            Lista
          </a>{" "}
          para alimentar a lista principal antes de disparar mensagens.
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
        open={templateOpen}
        onOpenChange={(o) => {
          setTemplateOpen(o);
          if (!o) setTemplateError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Template de mensagem</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mensagem padrão usada em novas campanhas. Você pode personalizar por
            campanha depois, se necessário.
          </p>
          {templateError ? (
            <p className="text-sm text-destructive">{templateError}</p>
          ) : null}
          <TemplateEditor templateBody={templateDraft} onChange={setTemplateDraft} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={templateBusy}
              onClick={() => setTemplateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={templateBusy || !templateDraft.trim()}
              onClick={() => void onSaveTemplate()}
            >
              {templateBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              <span className={templateBusy ? "ml-2" : ""}>Salvar template</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {primaryList ? (
                <Card>
                  <CardContent className="py-3 text-sm">
                    <p className="font-medium">{primaryList.name}</p>
                    <p className="text-muted-foreground">
                      {primaryList.itemCount} destinatário(s) da lista principal
                    </p>
                  </CardContent>
                </Card>
              ) : null}
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
            <div className="space-y-2 text-sm">
              <p>
                <strong>Lista:</strong> {selectedList?.name} (
                {selectedList?.itemCount} contatos)
              </p>
              <p>
                <strong>Conexão:</strong> {selectedConn?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                A mensagem segue o template configurado no workspace. O envio
                respeita o throttle configurado (padrão 1 msg / 45s).
                Destinatários podem responder SAIR para opt-out.
              </p>
              {!templateBody.trim() ? (
                <p className="text-sm text-destructive">
                  Configure o template antes de criar a campanha.
                </p>
              ) : null}
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
            {step < 2 ? (
              <Button
                type="button"
                disabled={
                  busy ||
                  (step === 0 && !primaryList?.id) ||
                  (step === 1 && !connectionId)
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
                  disabled={busy || !templateBody.trim()}
                  onClick={() => void onCreateAndMaybeStart(false)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span className={busy ? "ml-2" : ""}>Salvar rascunho</span>
                </Button>
                <Button
                  type="button"
                  disabled={busy || !templateBody.trim()}
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
