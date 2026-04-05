"use client";

import { useState } from "react";
import { createDeal } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Pipeline, Stage } from "@prisma/client";

type ContactOpt = { id: string; name: string; phone: string | null };

export function PipelineNewDeal({
  pipeline,
  contacts,
  defaultStageId,
  variant = "toolbar",
}: {
  pipeline: Pipeline & { stages: Stage[] };
  contacts: ContactOpt[];
  defaultStageId?: string;
  variant?: "toolbar" | "column";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const stageId = defaultStageId ?? pipeline.stages[0]?.id;

  if (!stageId) return null;

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
    setOpen(false);
    e.currentTarget.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "column" ? (
          <button
            type="button"
            className={cn(
              "w-full rounded-xl border border-dashed border-border/70 bg-background/60 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors",
              "hover:border-foreground/25 hover:bg-background hover:text-foreground",
            )}
          >
            + Novo lead
          </button>
        ) : (
          <Button type="button" className="shrink-0 font-medium">
            + Novo lead
          </Button>
        )}
      </DialogTrigger>
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione…
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
            {contacts.length === 0 ? (
              <p className="w-full text-sm text-muted-foreground">
                Cadastre um contato antes de criar deals.
              </p>
            ) : null}
            <Button type="submit" disabled={loading || contacts.length === 0}>
              {loading ? "Criando…" : "Criar deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
