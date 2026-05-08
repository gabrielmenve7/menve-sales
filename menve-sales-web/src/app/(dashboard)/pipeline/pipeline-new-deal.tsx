"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { listContactsForPipeline } from "@/actions/contacts";
import { createDeal } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Pipeline, Stage } from "@prisma/client";

type ContactOpt = { id: string; name: string; phone: string | null };

export function PipelineNewDealDialog({
  open,
  onOpenChange,
  pipeline,
  stageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline & { stages: Stage[] };
  stageId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContactsLoading(true);
    void (async () => {
      try {
        const rows = await listContactsForPipeline();
        if (!cancelled) setContacts(rows);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const contactId = String(fd.get("contactId") ?? "");
    const title = String(fd.get("title") ?? "").trim();
    const valueRaw = String(fd.get("value") ?? "").trim();
    const value = valueRaw ? Number(valueRaw.replace(",", ".")) : undefined;
    if (!contactId || !title) {
      setLoading(false);
      return;
    }
    await createDeal({
      contactId,
      pipelineId: pipeline.id,
      stageId,
      title,
      value: Number.isFinite(value) ? value : undefined,
    });
    setLoading(false);
    onOpenChange(false);
    e.currentTarget.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription>
              Será criado na etapa:{" "}
              <strong>
                {pipeline.stages.find((s) => s.id === stageId)?.name ?? "—"}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="contactId">Contato</Label>
              <select
                id="contactId"
                name="contactId"
                required
                disabled={contactsLoading}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm disabled:opacity-60"
                defaultValue=""
              >
                <option value="" disabled>
                  {contactsLoading ? "Carregando contatos…" : "Selecione…"}
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="title">Título da oportunidade</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="Ex: Proposta anual"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value">Valor (opcional)</Label>
              <Input
                id="value"
                name="value"
                inputMode="decimal"
                placeholder="15000"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {!contactsLoading && contacts.length === 0 ? (
              <p className="w-full text-sm text-muted-foreground">
                Cadastre um contato antes de criar deals.
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={loading || contactsLoading || contacts.length === 0}
            >
              {loading ? "Criando…" : "Criar deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botão “+” circular no topo da coluna Kanban (abre o mesmo diálogo que o rodapé). */
export function PipelineColumnNewDealHeaderButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Novo lead nesta etapa"
      title="Novo lead nesta etapa"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-border/45 bg-card text-foreground shadow-sm transition-colors",
        "hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "dark:border-border/50",
      )}
      onClick={onClick}
    >
      <Plus className="size-[18px]" strokeWidth={2} />
    </button>
  );
}

/** Área tracejada “ADICIONAR” no rodapé da coluna Kanban. */
export function PipelineColumnNewDealFooterTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-transparent py-4 text-muted-foreground transition-colors",
        "hover:border-foreground/20 hover:bg-background/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-border/80 text-foreground">
        <Plus className="size-4" strokeWidth={2} />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wide">
        Adicionar
      </span>
    </button>
  );
}

export function PipelineNewDeal({
  pipeline,
  defaultStageId,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  defaultStageId?: string;
}) {
  const [open, setOpen] = useState(false);
  const stageId = defaultStageId ?? pipeline.stages[0]?.id;

  if (!stageId) return null;

  return (
    <>
      <Button type="button" className="shrink-0 font-medium" onClick={() => setOpen(true)}>
        + Novo lead
      </Button>
      <PipelineNewDealDialog
        open={open}
        onOpenChange={setOpen}
        pipeline={pipeline}
        stageId={stageId}
      />
    </>
  );
}
