"use client";

import type { Pipeline, Stage } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createPipeline,
  deletePipeline,
  reorderPipelines,
  setDefaultPipeline,
  updatePipeline,
} from "@/actions/pipelines";
import {
  createStage,
  deleteStage,
  reorderStages,
  updateStage,
} from "@/actions/pipeline-stages";
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

type PipelineWithStages = Pipeline & { stages: Stage[] };

export function SettingsPipelineStages({
  pipelines: initialPipelines,
}: {
  pipelines: PipelineWithStages[];
}) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState(initialPipelines);

  useEffect(() => {
    setPipelines(initialPipelines);
  }, [initialPipelines]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineColor, setNewPipelineColor] = useState("");

  async function onCreatePipeline(e: React.FormEvent) {
    e.preventDefault();
    const name = newPipelineName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createPipeline({
        name,
        color: newPipelineColor.trim() || undefined,
      });
      setNewPipelineName("");
      setNewPipelineColor("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar funil");
    } finally {
      setBusy(false);
    }
  }

  async function persistPipelineOrder(next: PipelineWithStages[]) {
    setPipelines(next);
    setBusy(true);
    setError(null);
    try {
      await reorderPipelines({
        orderedPipelineIds: next.map((p) => p.id),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reordenar funis");
      setPipelines(initialPipelines);
    } finally {
      setBusy(false);
    }
  }

  function movePipeline(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= pipelines.length) return;
    const next = [...pipelines];
    [next[index], next[j]] = [next[j], next[index]];
    void persistPipelineOrder(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funis e etapas</CardTitle>
        <CardDescription>
          Vários funis por tenant. Cada coluna do Kanban é uma etapa; cores são
          opcionais (#RRGGBB).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <form
          onSubmit={(e) => void onCreatePipeline(e)}
          className="space-y-3 rounded-lg border p-3"
        >
          <p className="text-sm font-medium">Novo funil</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="pl-name">Nome</Label>
              <Input
                id="pl-name"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="Ex: Vendas B2B"
                className="min-w-[200px]"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="pl-color">Cor (opcional)</Label>
              <Input
                id="pl-color"
                value={newPipelineColor}
                onChange={(e) => setNewPipelineColor(e.target.value)}
                placeholder="#171717"
                className="w-28 font-mono text-xs"
              />
            </div>
            <Button type="submit" disabled={busy || !newPipelineName.trim()}>
              Criar funil
            </Button>
          </div>
        </form>

        {pipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum funil. Crie acima.
          </p>
        ) : (
          <div className="space-y-6">
            {pipelines.map((p, i) => (
              <PipelineBlock
                key={p.id}
                pipeline={p}
                disabled={busy}
                canUp={i > 0}
                canDown={i < pipelines.length - 1}
                onMoveUp={() => movePipeline(i, -1)}
                onMoveDown={() => movePipeline(i, 1)}
                onError={setError}
                setBusy={setBusy}
                onRefresh={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineBlock({
  pipeline,
  disabled,
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
  onError,
  setBusy,
  onRefresh,
}: {
  pipeline: PipelineWithStages;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onError: (s: string | null) => void;
  setBusy: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(pipeline.name);
  const [color, setColor] = useState(pipeline.color ?? "");

  useEffect(() => {
    setName(pipeline.name);
    setColor(pipeline.color ?? "");
  }, [pipeline.id, pipeline.name, pipeline.color]);

  const [stages, setStages] = useState(pipeline.stages);
  useEffect(() => {
    setStages(pipeline.stages);
  }, [pipeline.stages]);

  const [newName, setNewName] = useState("");
  const [newProb, setNewProb] = useState("");
  const [newColor, setNewColor] = useState("");

  async function onSavePipeline() {
    setBusy(true);
    onError(null);
    try {
      await updatePipeline({
        id: pipeline.id,
        name: name.trim(),
        color: color.trim() || null,
      });
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao salvar funil");
    } finally {
      setBusy(false);
    }
  }

  async function onDefault() {
    setBusy(true);
    onError(null);
    try {
      await setDefaultPipeline(pipeline.id);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePipeline() {
    if (!confirm(`Excluir o funil "${pipeline.name}"?`)) return;
    setBusy(true);
    onError(null);
    try {
      await deletePipeline(pipeline.id);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  async function persistStageOrder(next: Stage[]) {
    setStages(next);
    setBusy(true);
    onError(null);
    try {
      await reorderStages({
        pipelineId: pipeline.id,
        orderedStageIds: next.map((s) => s.id),
      });
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao reordenar etapas");
      setStages(pipeline.stages);
    } finally {
      setBusy(false);
    }
  }

  function moveStage(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[index], next[j]] = [next[j], next[index]];
    void persistStageOrder(next);
  }

  async function onCreateStage(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    onError(null);
    try {
      const prob =
        newProb.trim() === "" ? undefined : Number.parseFloat(newProb);
      await createStage({
        pipelineId: pipeline.id,
        name: n,
        probability:
          prob !== undefined && !Number.isNaN(prob) ? prob : null,
        color: newColor.trim() || null,
      });
      setNewName("");
      setNewProb("");
      setNewColor("");
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao criar etapa");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRow(
    s: Stage,
    rowName: string,
    probStr: string,
    rowColor: string,
  ) {
    setBusy(true);
    onError(null);
    try {
      const prob =
        probStr.trim() === "" ? null : Number.parseFloat(probStr);
      await updateStage({
        id: s.id,
        name: rowName.trim(),
        probability:
          prob === null || Number.isNaN(prob) ? null : prob,
        color: rowColor.trim() || null,
      });
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteStage(id: string) {
    if (!confirm("Excluir esta etapa?")) return;
    setBusy(true);
    onError(null);
    try {
      await deleteStage(id);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-border/60 pb-4">
        <div className="grid min-w-[180px] flex-1 gap-1">
          <Label className="text-xs">Nome do funil</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="grid w-28 gap-1">
          <Label className="text-xs">Cor</Label>
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#525252"
            disabled={disabled}
            className="font-mono text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => void onSavePipeline()}
        >
          Salvar funil
        </Button>
        {pipeline.isDefault ? (
          <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs">
            Padrão
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => void onDefault()}
          >
            Definir como padrão
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canUp}
          onClick={onMoveUp}
        >
          Funil ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canDown}
          onClick={onMoveDown}
        >
          Funil ↓
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={disabled}
          onClick={() => void onDeletePipeline()}
        >
          Excluir funil
        </Button>
      </div>

      <form onSubmit={(e) => void onCreateStage(e)} className="mb-4 space-y-2">
        <p className="text-sm font-medium">Nova etapa neste funil</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`st-name-${pipeline.id}`}>Nome</Label>
            <Input
              id={`st-name-${pipeline.id}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="min-w-[160px]"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`st-prob-${pipeline.id}`}>Prob. %</Label>
            <Input
              id={`st-prob-${pipeline.id}`}
              type="number"
              min={0}
              max={100}
              value={newProb}
              onChange={(e) => setNewProb(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`st-col-${pipeline.id}`}>Cor</Label>
            <Input
              id={`st-col-${pipeline.id}`}
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              placeholder="#hex"
              className="w-24 font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={disabled || !newName.trim()}>
            Adicionar etapa
          </Button>
        </div>
      </form>

      <p className="mb-2 text-sm font-medium">Etapas ({stages.length})</p>
      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa.</p>
      ) : (
        <ul className="space-y-2">
          {stages.map((s, i) => (
            <StageRow
              key={`${s.id}-${s.name}-${s.probability}-${s.color ?? ""}`}
              stage={s}
              disabled={disabled}
              onMoveUp={() => moveStage(i, -1)}
              onMoveDown={() => moveStage(i, 1)}
              canUp={i > 0}
              canDown={i < stages.length - 1}
              onSave={onSaveRow}
              onDelete={() => void onDeleteStage(s.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StageRow({
  stage,
  disabled,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
  onSave,
  onDelete,
}: {
  stage: Stage;
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
  onSave: (
    s: Stage,
    name: string,
    probStr: string,
    colorStr: string,
  ) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [prob, setProb] = useState(
    stage.probability != null ? String(stage.probability) : "",
  );
  const [rowColor, setRowColor] = useState(stage.color ?? "");

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-sm">
      <div className="grid min-w-[140px] flex-1 gap-1">
        <Label className="text-xs">Nome</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="grid w-24 gap-1">
        <Label className="text-xs">Prob. %</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={prob}
          onChange={(e) => setProb(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="grid w-24 gap-1">
        <Label className="text-xs">Cor</Label>
        <Input
          value={rowColor}
          onChange={(e) => setRowColor(e.target.value)}
          placeholder="#hex"
          disabled={disabled}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canUp}
          onClick={onMoveUp}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canDown}
          onClick={onMoveDown}
        >
          ↓
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => void onSave(stage, name, prob, rowColor)}
        >
          Salvar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          Excluir
        </Button>
      </div>
    </li>
  );
}
