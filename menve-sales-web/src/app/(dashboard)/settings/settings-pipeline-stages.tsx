"use client";

import type { Pipeline, Stage } from "@prisma/client";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
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
import { HexColorField } from "@/components/settings/hex-color-field";
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

export type SettingsPipelineStagesHandle = {
  save: () => Promise<void>;
};

export type SettingsPipelineStagesProps = {
  pipelines: PipelineWithStages[];
  /** Layout sem cartão (página dedicada de configuração do funil). */
  bare?: boolean;
  onEditorMetaChange?: (meta: { dirty: boolean; busy: boolean }) => void;
};

/** Clone para estado local; JSON evita falha de `structuredClone` no SSR com props do Flight. */
function clonePipelines(p: PipelineWithStages[]): PipelineWithStages[] {
  return JSON.parse(JSON.stringify(p)) as PipelineWithStages[];
}

function normColor(c: string | null | undefined): string {
  return (c ?? "").trim();
}

function probabilityEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Snapshot só dos campos editáveis (para reset após refresh). */
function pipelinesBaselineJson(pipelines: PipelineWithStages[]): string {
  return JSON.stringify(
    pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      wonStageId: p.wonStageId ?? null,
      lostStageId: p.lostStageId ?? null,
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        probability: s.probability,
        color: s.color,
      })),
    })),
  );
}

function isDirty(
  local: PipelineWithStages[],
  server: PipelineWithStages[],
): boolean {
  const serverMap = new Map(server.map((p) => [p.id, p]));
  for (const lp of local) {
    const sp = serverMap.get(lp.id);
    if (!sp) return true;
    if (lp.name !== sp.name) return true;
    if (normColor(lp.color) !== normColor(sp.color)) return true;
    if ((lp.wonStageId ?? null) !== (sp.wonStageId ?? null)) return true;
    if ((lp.lostStageId ?? null) !== (sp.lostStageId ?? null)) return true;
    if (lp.stages.length !== sp.stages.length) return true;
    const ssMap = new Map(sp.stages.map((s) => [s.id, s]));
    for (const ls of lp.stages) {
      const ss = ssMap.get(ls.id);
      if (!ss) return true;
      if (ls.name !== ss.name) return true;
      if (!probabilityEqual(ls.probability, ss.probability)) return true;
      if (normColor(ls.color) !== normColor(ss.color)) return true;
    }
  }
  return false;
}

function SortableStageRow({
  stage,
  disabled,
  onPatch,
  onDelete,
}: {
  stage: Stage;
  disabled: boolean;
  onPatch: (
    patch: Partial<Pick<Stage, "name" | "probability" | "color">>,
  ) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  const probStr =
    stage.probability != null && !Number.isNaN(stage.probability)
      ? String(stage.probability)
      : "";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/30 p-3 text-sm dark:bg-muted/15 sm:gap-3"
    >
      <div className="grid w-9 shrink-0 gap-1">
        <span className="text-xs leading-none opacity-0 select-none" aria-hidden>
          —
        </span>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground hover:bg-muted/60 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
          disabled={disabled}
          aria-label="Arrastar para reordenar etapa"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" strokeWidth={2} />
        </button>
      </div>
      <div className="grid min-w-[140px] flex-1 gap-1">
        <Label className="text-xs">Nome</Label>
        <Input
          value={stage.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="grid w-24 gap-1">
        <Label className="text-xs">Prob. %</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={probStr}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onPatch({ probability: null });
              return;
            }
            const n = Number.parseFloat(v);
            onPatch({
              probability: Number.isNaN(n) ? null : n,
            });
          }}
          disabled={disabled}
        />
      </div>
      <div className="grid min-w-[11rem] max-w-[15rem] gap-1">
        <Label className="text-xs">Cor</Label>
        <HexColorField
          value={stage.color ?? ""}
          onChange={(c) => onPatch({ color: c || null })}
          disabled={disabled}
          placeholder="#525252"
        />
      </div>
      <div className="flex flex-wrap items-end gap-1">
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

function PipelineStagesSortableList({
  pipelineId,
  stages,
  disabled,
  onPersistStageOrder,
  onPatchStage,
  onDeleteStage,
}: {
  pipelineId: string;
  stages: Stage[];
  disabled: boolean;
  onPersistStageOrder: (
    pipelineId: string,
    nextStages: Stage[],
  ) => Promise<void>;
  onPatchStage: (
    stageId: string,
    patch: Partial<Pick<Stage, "name" | "probability" | "color">>,
  ) => void;
  onDeleteStage: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = useMemo(() => stages.map((s) => s.id), [stages]);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(stages, oldIndex, newIndex);
    void onPersistStageOrder(pipelineId, next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {stages.map((s) => (
            <SortableStageRow
              key={s.id}
              stage={s}
              disabled={disabled}
              onPatch={(patch) => onPatchStage(s.id, patch)}
              onDelete={() => onDeleteStage(s.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export const SettingsPipelineStages = forwardRef<
  SettingsPipelineStagesHandle,
  SettingsPipelineStagesProps
>(function SettingsPipelineStages(
  { pipelines: initialPipelines, bare = false, onEditorMetaChange },
  ref,
) {
  const router = useRouter();
  const [localPipelines, setLocalPipelines] = useState(() =>
    clonePipelines(initialPipelines),
  );

  const baseline = useMemo(
    () => pipelinesBaselineJson(initialPipelines),
    [initialPipelines],
  );

  useEffect(() => {
    setLocalPipelines(clonePipelines(initialPipelines));
  }, [baseline, initialPipelines]);

  const dirty = useMemo(
    () => isDirty(localPipelines, initialPipelines),
    [localPipelines, initialPipelines],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEditorMetaChange?.({ dirty, busy });
  }, [dirty, busy, onEditorMetaChange]);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineColor, setNewPipelineColor] = useState("");

  function patchPipeline(
    pipelineId: string,
    patch: Partial<
      Pick<Pipeline, "name" | "color" | "wonStageId" | "lostStageId">
    >,
  ) {
    setLocalPipelines((prev) =>
      prev.map((p) => (p.id === pipelineId ? { ...p, ...patch } : p)),
    );
  }

  function patchStage(
    pipelineId: string,
    stageId: string,
    patch: Partial<Pick<Stage, "name" | "probability" | "color">>,
  ) {
    setLocalPipelines((prev) =>
      prev.map((p) => {
        if (p.id !== pipelineId) return p;
        return {
          ...p,
          stages: p.stages.map((s) =>
            s.id === stageId ? { ...s, ...patch } : s,
          ),
        };
      }),
    );
  }

  const saveAllEdits = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const serverMap = new Map(initialPipelines.map((p) => [p.id, p]));
      for (const lp of localPipelines) {
        const sp = serverMap.get(lp.id);
        if (!sp) continue;
        const nameChanged = lp.name !== sp.name;
        const colorChanged = normColor(lp.color) !== normColor(sp.color);
        const wonChanged =
          (lp.wonStageId ?? null) !== (sp.wonStageId ?? null);
        const lostChanged =
          (lp.lostStageId ?? null) !== (sp.lostStageId ?? null);
        if (nameChanged || colorChanged || wonChanged || lostChanged) {
          await updatePipeline({
            id: lp.id,
            ...(nameChanged ? { name: lp.name.trim() } : {}),
            ...(colorChanged
              ? { color: normColor(lp.color) || null }
              : {}),
            ...(wonChanged ? { wonStageId: lp.wonStageId ?? null } : {}),
            ...(lostChanged ? { lostStageId: lp.lostStageId ?? null } : {}),
          });
        }
        const ssMap = new Map(sp.stages.map((s) => [s.id, s]));
        for (const ls of lp.stages) {
          const ss = ssMap.get(ls.id);
          if (!ss) continue;
          if (
            ls.name !== ss.name ||
            !probabilityEqual(ls.probability, ss.probability) ||
            normColor(ls.color) !== normColor(ss.color)
          ) {
            await updateStage({
              id: ls.id,
              name: ls.name.trim(),
              probability: ls.probability ?? null,
              color: normColor(ls.color) || null,
            });
          }
        }
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao salvar alterações",
      );
    } finally {
      setBusy(false);
    }
  }, [localPipelines, initialPipelines, router]);

  useImperativeHandle(
    ref,
    () => ({
      save: () => saveAllEdits(),
    }),
    [saveAllEdits],
  );

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
    setLocalPipelines(next);
    setBusy(true);
    setError(null);
    try {
      await reorderPipelines({
        orderedPipelineIds: next.map((p) => p.id),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reordenar funis");
      setLocalPipelines(clonePipelines(initialPipelines));
    } finally {
      setBusy(false);
    }
  }

  function movePipeline(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= localPipelines.length) return;
    const next = [...localPipelines];
    [next[index], next[j]] = [next[j], next[index]];
    void persistPipelineOrder(next);
  }

  if (bare) {
    return (
      <div className="space-y-8">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <form
          onSubmit={(e) => void onCreatePipeline(e)}
          className="space-y-3 rounded-xl bg-muted/25 p-4 dark:bg-muted/10"
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
            <div className="grid min-w-[11rem] gap-1">
              <Label htmlFor="pl-color">Cor (opcional)</Label>
              <HexColorField
                id="pl-color"
                value={newPipelineColor}
                onChange={setNewPipelineColor}
                disabled={busy}
                placeholder="#171717"
              />
            </div>
            <Button type="submit" disabled={busy || !newPipelineName.trim()}>
              Criar funil
            </Button>
          </div>
        </form>

        {localPipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum funil. Crie acima.
          </p>
        ) : (
          <>
            <div className="space-y-6">
              {localPipelines.map((p, i) => (
                <PipelineBlock
                  key={p.id}
                  pipeline={p}
                  disabled={busy}
                  canUp={i > 0}
                  canDown={i < localPipelines.length - 1}
                  onMoveUp={() => movePipeline(i, -1)}
                  onMoveDown={() => movePipeline(i, 1)}
                  onError={setError}
                  setBusy={setBusy}
                  onRefresh={() => router.refresh()}
                  onPatchPipeline={patchPipeline}
                  onPatchStage={patchStage}
                  showGlobalSave={i === 0}
                  hideGlobalSaveButton
                  dirty={dirty}
                  onSaveAll={() => void saveAllEdits()}
                  onPersistStageOrder={async (pipelineId, nextStages) => {
                    setLocalPipelines((prev) =>
                      prev.map((pl) =>
                        pl.id === pipelineId
                          ? { ...pl, stages: nextStages }
                          : pl,
                      ),
                    );
                    setBusy(true);
                    setError(null);
                    try {
                      await reorderStages({
                        pipelineId,
                        orderedStageIds: nextStages.map((s) => s.id),
                      });
                      router.refresh();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Erro ao reordenar etapas",
                      );
                      setLocalPipelines(clonePipelines(initialPipelines));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader>
        <CardTitle>Funis e etapas</CardTitle>
        <CardDescription>
          Vários funis por tenant. Cada coluna do Kanban é uma etapa; cores são
          opcionais (#RRGGBB). Um único salvar na linha do nome do primeiro
          funil aplica alterações em todos os funis e etapas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <form
          onSubmit={(e) => void onCreatePipeline(e)}
          className="space-y-3 rounded-xl bg-muted/25 p-4 dark:bg-muted/10"
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
            <div className="grid min-w-[11rem] gap-1">
              <Label htmlFor="pl-color">Cor (opcional)</Label>
              <HexColorField
                id="pl-color"
                value={newPipelineColor}
                onChange={setNewPipelineColor}
                disabled={busy}
                placeholder="#171717"
              />
            </div>
            <Button type="submit" disabled={busy || !newPipelineName.trim()}>
              Criar funil
            </Button>
          </div>
        </form>

        {localPipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum funil. Crie acima.
          </p>
        ) : (
          <>
            <div className="space-y-6">
              {localPipelines.map((p, i) => (
                <PipelineBlock
                  key={p.id}
                  pipeline={p}
                  disabled={busy}
                  canUp={i > 0}
                  canDown={i < localPipelines.length - 1}
                  onMoveUp={() => movePipeline(i, -1)}
                  onMoveDown={() => movePipeline(i, 1)}
                  onError={setError}
                  setBusy={setBusy}
                  onRefresh={() => router.refresh()}
                  onPatchPipeline={patchPipeline}
                  onPatchStage={patchStage}
                  showGlobalSave={i === 0}
                  dirty={dirty}
                  onSaveAll={() => void saveAllEdits()}
                  onPersistStageOrder={async (pipelineId, nextStages) => {
                    setLocalPipelines((prev) =>
                      prev.map((pl) =>
                        pl.id === pipelineId
                          ? { ...pl, stages: nextStages }
                          : pl,
                      ),
                    );
                    setBusy(true);
                    setError(null);
                    try {
                      await reorderStages({
                        pipelineId,
                        orderedStageIds: nextStages.map((s) => s.id),
                      });
                      router.refresh();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Erro ao reordenar etapas",
                      );
                      setLocalPipelines(clonePipelines(initialPipelines));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

SettingsPipelineStages.displayName = "SettingsPipelineStages";

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
  onPatchPipeline,
  onPatchStage,
  showGlobalSave,
  hideGlobalSaveButton = false,
  dirty,
  onSaveAll,
  onPersistStageOrder,
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
  onPatchPipeline: (
    pipelineId: string,
    patch: Partial<
      Pick<Pipeline, "name" | "color" | "wonStageId" | "lostStageId">
    >,
  ) => void;
  onPatchStage: (
    pipelineId: string,
    stageId: string,
    patch: Partial<Pick<Stage, "name" | "probability" | "color">>,
  ) => void;
  showGlobalSave: boolean;
  hideGlobalSaveButton?: boolean;
  dirty: boolean;
  onSaveAll: () => void;
  onPersistStageOrder: (
    pipelineId: string,
    nextStages: Stage[],
  ) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newProb, setNewProb] = useState("");
  const [newColor, setNewColor] = useState("");

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

  async function onDeleteStage(id: string) {
    if (
      !confirm(
        "Excluir esta etapa? Se houver oportunidades nela, serão movidas para a primeira etapa restante deste funil (ordem do Kanban).",
      )
    )
      return;
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
    <div className="rounded-xl bg-muted/20 p-4 dark:bg-muted/10">
      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-border/25 pb-4 dark:border-border/30">
        <div className="grid min-w-[180px] flex-1 gap-1">
          <Label className="text-xs">Nome do funil</Label>
          <Input
            value={pipeline.name}
            onChange={(e) =>
              onPatchPipeline(pipeline.id, { name: e.target.value })
            }
            disabled={disabled}
          />
        </div>
        <div className="grid min-w-[11rem] gap-1">
          <Label className="text-xs">Cor</Label>
          <HexColorField
            value={pipeline.color ?? ""}
            onChange={(c) => onPatchPipeline(pipeline.id, { color: c })}
            disabled={disabled}
            placeholder="#525252"
          />
        </div>
        {pipeline.isDefault ? (
          <span className="rounded-md bg-muted/90 px-2 py-1 text-xs dark:bg-muted/50">
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
        <div className="flex flex-wrap items-end gap-2">
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
          {showGlobalSave && !hideGlobalSaveButton ? (
            <Button
              type="button"
              size="sm"
              disabled={disabled || !dirty}
              onClick={onSaveAll}
              className="bg-black px-4 text-white hover:bg-black/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
            >
              Salvar alterações
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 space-y-3 rounded-lg border border-border/40 bg-background/50 p-3 dark:bg-background/25">
        <p className="text-sm font-medium">Status especiais (ganho / perda)</p>
        <p className="text-xs text-muted-foreground">
          Ao mover um lead no Kanban para a etapa indicada, a oportunidade passa
          a contar como ganha ou perdida no dashboard.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs" htmlFor={`won-${pipeline.id}`}>
              Etapa de ganho
            </Label>
            <select
              id={`won-${pipeline.id}`}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={pipeline.wonStageId ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim();
                onPatchPipeline(pipeline.id, {
                  wonStageId: v === "" ? null : v,
                });
              }}
            >
              <option value="">Nenhuma</option>
              {[...pipeline.stages]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs" htmlFor={`lost-${pipeline.id}`}>
              Etapa de perda
            </Label>
            <select
              id={`lost-${pipeline.id}`}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={pipeline.lostStageId ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim();
                onPatchPipeline(pipeline.id, {
                  lostStageId: v === "" ? null : v,
                });
              }}
            >
              <option value="">Nenhuma</option>
              {[...pipeline.stages]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void onCreateStage(e)} className="mb-4 space-y-2">
        <p className="text-sm font-medium">Nova etapa neste funil</p>
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="grid min-w-[11rem] gap-1">
            <Label htmlFor={`st-col-${pipeline.id}`}>Cor</Label>
            <HexColorField
              id={`st-col-${pipeline.id}`}
              value={newColor}
              onChange={setNewColor}
              disabled={disabled}
              placeholder="#525252"
            />
          </div>
          <Button type="submit" disabled={disabled || !newName.trim()}>
            Adicionar etapa
          </Button>
        </div>
      </form>

      <p className="mb-2 text-sm font-medium">Etapas ({pipeline.stages.length})</p>
      {pipeline.stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa.</p>
      ) : (
        <PipelineStagesSortableList
          pipelineId={pipeline.id}
          stages={pipeline.stages}
          disabled={disabled}
          onPersistStageOrder={onPersistStageOrder}
          onPatchStage={(stageId, patch) =>
            onPatchStage(pipeline.id, stageId, patch)
          }
          onDeleteStage={(id) => void onDeleteStage(id)}
        />
      )}
    </div>
  );
}
