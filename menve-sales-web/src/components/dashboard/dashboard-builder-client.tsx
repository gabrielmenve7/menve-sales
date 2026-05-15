"use client";

import ReactGridLayout, {
  type Layout,
  WidthProvider,
} from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Copy,
  CopyPlus,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDashboardBoard,
  deleteDashboardBoard,
  duplicateDashboardBoard,
  seedDefaultDashboardBoard,
  updateDashboardBoard,
} from "@/actions/dashboard-boards";
import { queryDashboardWidgetsBulk } from "@/actions/dashboard-widgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardWidgetConfigDialog, widgetTypeLabel } from "@/components/dashboard/dashboard-widget-config-dialog";
import { DashboardWidgetRenderer } from "@/components/dashboard/dashboard-widget-renderer";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import type {
  DashboardBoardDto,
  DealCustomFieldDef,
  LayoutJson,
  LayoutWidget,
  PipelineListItem,
  TagListItem,
  WidgetDataResult,
  WidgetType,
} from "@/lib/dashboard-builder-types";
import {
  DEFAULT_SALES_DASHBOARD_BOARD_NAME,
  defaultBarWidgetQueryAndChart,
  defaultQuerySpec,
  newWidgetId,
  parseLayoutJson,
} from "@/lib/dashboard-builder-types";

const GridLayoutWithWidth = WidthProvider(ReactGridLayout);

const MAX_WIDGETS = 48;

type BoardVm = DashboardBoardDto & { layout: LayoutJson };

function toVm(dto: DashboardBoardDto): BoardVm {
  return { ...dto, layout: parseLayoutJson(dto.layoutJson) };
}

function defaultPipelineId(pipelines: PipelineListItem[]) {
  return pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? "";
}

function nextGrid(widgets: LayoutWidget[], type: WidgetType) {
  let maxY = 0;
  for (const w of widgets) {
    maxY = Math.max(maxY, w.grid.y + w.grid.h);
  }
  const h = type === "METRIC" ? 3 : 6;
  return { x: 0, y: maxY, w: type === "METRIC" ? 3 : 6, h };
}

export function DashboardBuilderClient({
  initialBoards,
  initialPipelines,
  initialTags,
  initialDealCustomFields,
  initialTenantMembers = [],
  initialWidgetBundle = null,
}: {
  initialBoards: DashboardBoardDto[];
  initialPipelines: PipelineListItem[];
  initialTags: TagListItem[];
  initialDealCustomFields: DealCustomFieldDef[];
  initialTenantMembers?: TenantMemberOption[];
  /** Dados do primeiro painel já buscados no SSR (evita 2º round-trip no mount). */
  initialWidgetBundle?: {
    boardId: string;
    specsKey: string;
    rows: WidgetDataResult[];
  } | null;
}) {
  const [boards, setBoards] = useState<BoardVm[]>(() =>
    initialBoards.map(toVm),
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (initialBoards.length === 0) return null;
    return initialBoards[0]?.id ?? null;
  });
  const [pipelines] = useState(initialPipelines);
  const [tags] = useState(initialTags);
  const [dealCustomFields] = useState(initialDealCustomFields);
  const [tenantMembers] = useState(initialTenantMembers);
  const [dataByWidget, setDataByWidget] = useState<
    Record<string, WidgetDataResult | null>
  >({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [configWidget, setConfigWidget] = useState<LayoutWidget | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeId) ?? null,
    [boards, activeId],
  );

  const persistLayout = useCallback((boardId: string, layout: LayoutJson) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateDashboardBoard(boardId, { layoutJson: layout }).catch(() => {
        /* toast opcional */
      });
    }, 600);
  }, []);

  const setLayoutForActive = useCallback(
    (updater: (prev: LayoutJson) => LayoutJson) => {
      if (!activeId) return;
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== activeId) return b;
          const layout = updater(b.layout);
          persistLayout(activeId, layout);
          return { ...b, layout };
        }),
      );
    },
    [activeId, persistLayout],
  );

  const specsKey = useMemo(() => {
    if (!activeBoard) return "";
    return JSON.stringify(
      activeBoard.layout.widgets.map((w) => w.querySpec),
    );
  }, [activeBoard]);

  useEffect(() => {
    if (!activeBoard || activeBoard.layout.widgets.length === 0) {
      setDataByWidget({});
      setLoadingData(false);
      return;
    }

    if (
      initialWidgetBundle &&
      initialWidgetBundle.boardId === activeBoard.id &&
      initialWidgetBundle.specsKey === specsKey &&
      initialWidgetBundle.rows.length === activeBoard.layout.widgets.length
    ) {
      const map: Record<string, WidgetDataResult | null> = {};
      activeBoard.layout.widgets.forEach((w, i) => {
        map[w.id] = initialWidgetBundle.rows[i] ?? null;
      });
      setDataByWidget(map);
      setLoadErr(null);
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    setLoadingData(true);
    setLoadErr(null);
    void (async () => {
      try {
        const specs = activeBoard.layout.widgets.map((w) => w.querySpec);
        const rows = await queryDashboardWidgetsBulk(specs);
        if (cancelled) return;
        const map: Record<string, WidgetDataResult | null> = {};
        activeBoard.layout.widgets.forEach((w, i) => {
          map[w.id] = rows[i] ?? null;
        });
        setDataByWidget(map);
      } catch {
        if (!cancelled) {
          setLoadErr("Não foi possível carregar os dados dos cartões.");
          setDataByWidget({});
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBoard?.id, specsKey, activeBoard, initialWidgetBundle]);

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      setLayoutForActive((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) => {
          const l = layout.find((x) => x.i === w.id);
          if (!l) return w;
          return {
            ...w,
            grid: { x: l.x, y: l.y, w: l.w, h: l.h },
          };
        }),
      }));
    },
    [setLayoutForActive],
  );

  const pid = defaultPipelineId(pipelines);

  const addWidget = useCallback(
    (type: WidgetType) => {
      if (!activeId || !pid) return;
      if (activeBoard && activeBoard.layout.widgets.length >= MAX_WIDGETS) {
        return;
      }
      const id = newWidgetId();
      const grid = nextGrid(activeBoard?.layout.widgets ?? [], type);
      const w: LayoutWidget =
        type === "BAR"
          ? {
              id,
              type,
              grid,
              ...defaultBarWidgetQueryAndChart(pid),
            }
          : {
              id,
              type,
              querySpec: defaultQuerySpec(pid, type),
              grid,
            };
      setLayoutForActive((prev) => ({
        ...prev,
        widgets: [...prev.widgets, w],
      }));
      setConfigWidget(w);
    },
    [activeId, activeBoard, pid, setLayoutForActive],
  );

  const saveWidgetConfig = useCallback(
    (next: LayoutWidget) => {
      setLayoutForActive((prev) => ({
        ...prev,
        widgets: prev.widgets.map((x) => (x.id === next.id ? next : x)),
      }));
    },
    [setLayoutForActive],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setLayoutForActive((prev) => ({
        ...prev,
        widgets: prev.widgets.filter((w) => w.id !== id),
      }));
    },
    [setLayoutForActive],
  );

  const duplicateWidget = useCallback(
    (source: LayoutWidget) => {
      if (!activeId) return;
      if (activeBoard && activeBoard.layout.widgets.length >= MAX_WIDGETS) {
        return;
      }
      const copy = structuredClone(source) as LayoutWidget;
      copy.id = newWidgetId();
      copy.grid = {
        ...source.grid,
        y: source.grid.y + source.grid.h,
      };
      setLayoutForActive((prev) => ({
        ...prev,
        widgets: [...prev.widgets, copy],
      }));
    },
    [activeId, activeBoard, setLayoutForActive],
  );

  async function handleCreateBoard() {
    const b = await createDashboardBoard();
    const vm = toVm(b);
    setBoards((prev) => [vm, ...prev]);
    setActiveId(vm.id);
  }

  async function handleSeedDefaultBoard() {
    const b = await seedDefaultDashboardBoard({ force: true });
    if (!b) return;
    const vm = toVm(b);
    setBoards((prev) => [vm, ...prev]);
    setActiveId(vm.id);
  }

  async function handleDuplicateBoard() {
    if (!activeId) return;
    const b = await duplicateDashboardBoard(activeId);
    const vm = toVm(b);
    setBoards((prev) => [vm, ...prev]);
    setActiveId(vm.id);
  }

  function openRename() {
    const b = boards.find((x) => x.id === activeId);
    if (!b) return;
    setRenameValue(b.name);
    setRenameOpen(true);
  }

  async function submitRename() {
    if (!activeId) return;
    const name = renameValue.trim();
    if (!name) return;
    const updated = await updateDashboardBoard(activeId, { name });
    setBoards((prev) =>
      prev.map((b) =>
        b.id === activeId ? { ...toVm(updated) } : b,
      ),
    );
    setRenameOpen(false);
  }

  async function confirmDeleteBoard() {
    if (!deleteConfirmId) return;
    await deleteDashboardBoard(deleteConfirmId);
    setBoards((prev) => {
      const next = prev.filter((b) => b.id !== deleteConfirmId);
      if (activeId === deleteConfirmId) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
    setDeleteConfirmId(null);
  }

  const rglLayout: Layout = useMemo(() => {
    if (!activeBoard) return [];
    return activeBoard.layout.widgets.map((w) => ({
      i: w.id,
      x: w.grid.x,
      y: w.grid.y,
      w: w.grid.w,
      h: w.grid.h,
      minW: 2,
      minH: 2,
    }));
  }, [activeBoard]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            {activeBoard?.name === DEFAULT_SALES_DASHBOARD_BOARD_NAME ? (
              <Badge
                variant="secondary"
                className="font-normal border border-teal-500/25 bg-teal-500/10 text-teal-900 dark:border-teal-400/30 dark:bg-teal-500/15 dark:text-teal-50"
              >
                Painel padrão de vendas
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            O modelo &quot;Vendas — Visão geral&quot; traz KPIs e gráficos do pipeline;
            você pode editar, adicionar cartões ou criar painéis em branco.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus className="mr-1 size-4" />
                Novo painel
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleCreateBoard()}>
                <LayoutGrid className="mr-2 size-4" />
                Painel em branco
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleSeedDefaultBoard()}>
                <Sparkles className="mr-2 size-4" />
                Painel padrão de vendas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {activeId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openRename}>
                  <Pencil className="mr-2 size-4" />
                  Renomear painel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleDuplicateBoard()}>
                  <Copy className="mr-2 size-4" />
                  Duplicar painel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteConfirmId(activeId)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Excluir painel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {boards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-teal-500/25 bg-gradient-to-br from-teal-500/[0.07] via-card/50 to-violet-500/[0.08] px-6 py-16 text-center shadow-sm dark:border-teal-400/20 dark:from-teal-500/10 dark:via-card/30 dark:to-violet-500/10">
          <LayoutGrid className="mb-3 size-10 text-muted-foreground" />
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            Você ainda não tem painéis. Comece pelo modelo padrão de vendas
            (KPIs prontos) ou monte do zero.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => void handleSeedDefaultBoard()}>
              <Sparkles className="mr-1 size-4" />
              Usar painel padrão
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreateBoard()}
            >
              Criar em branco
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Tabs value={activeId ?? ""} onValueChange={(v) => setActiveId(v)}>
            <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 border-b border-border bg-transparent p-0">
              {boards.map((b) => (
                <TabsTrigger
                  key={b.id}
                  value={b.id}
                  className="shrink-0 rounded-t-md px-3 transition-colors data-[state=active]:border-b-2 data-[state=active]:border-teal-600 data-[state=active]:bg-teal-500/10 data-[state=active]:text-teal-900 data-[state=inactive]:hover:bg-muted/60 dark:data-[state=active]:border-teal-400 dark:data-[state=active]:bg-teal-500/15 dark:data-[state=active]:text-teal-100"
                >
                  {b.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {activeBoard ? (
            <div className="flex flex-1 flex-col">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!pid || activeBoard.layout.widgets.length >= MAX_WIDGETS}
                    >
                      <Plus className="mr-1 size-4" />
                      Cartão
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(
                      ["METRIC", "BAR", "PIE", "DONUT"] as WidgetType[]
                    ).map((t) => (
                      <DropdownMenuItem key={t} onClick={() => addWidget(t)}>
                        {widgetTypeLabel(t)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {activeBoard.layout.widgets.length >= MAX_WIDGETS ? (
                  <span className="text-xs text-muted-foreground">
                    Limite de {MAX_WIDGETS} cartões por painel.
                  </span>
                ) : null}
                {loadErr ? (
                  <span className="text-xs text-destructive">{loadErr}</span>
                ) : null}
              </div>

              {activeBoard.layout.widgets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-violet-500/20 bg-gradient-to-br from-sky-500/[0.05] via-transparent to-violet-500/[0.06] py-20 dark:border-violet-400/25">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Quadro em branco — use &quot;Cartão&quot; para adicionar métricas e gráficos.
                  </p>
                </div>
              ) : (
                <div className="min-h-[420px] flex-1 rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-transparent p-1 dark:from-muted/20">
                  <GridLayoutWithWidth
                    className="layout dashboard-grid-layout"
                    cols={12}
                    rowHeight={44}
                    margin={[8, 8]}
                    layout={rglLayout}
                    onLayoutChange={onLayoutChange}
                    draggableHandle=".drag-handle"
                    compactType="vertical"
                    isBounded={false}
                  >
                    {activeBoard.layout.widgets.map((w) => (
                      <div key={w.id} className="h-full">
                        <div className="group relative h-full">
                          <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 bg-background/80 shadow-sm"
                              onClick={() => setConfigWidget(w)}
                              title="Editar cartão"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 bg-background/80 shadow-sm"
                              onClick={() => duplicateWidget(w)}
                              disabled={
                                activeBoard.layout.widgets.length >= MAX_WIDGETS
                              }
                              title="Duplicar cartão"
                            >
                              <CopyPlus className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 bg-background/80 text-destructive shadow-sm hover:text-destructive"
                              onClick={() => removeWidget(w.id)}
                              title="Excluir cartão"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                          <DashboardWidgetRenderer
                            widget={w}
                            data={loadErr ? null : (dataByWidget[w.id] ?? null)}
                            loading={loadingData && !loadErr}
                            error={null}
                            dealCustomFields={dealCustomFields}
                            pipelines={pipelines}
                          />
                        </div>
                      </div>
                    ))}
                  </GridLayoutWithWidth>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      <DashboardWidgetConfigDialog
        open={configWidget != null}
        onOpenChange={(v) => {
          if (!v) setConfigWidget(null);
        }}
        widget={configWidget}
        pipelines={pipelines}
        tags={tags}
        dealCustomFields={dealCustomFields}
        tenantMembers={tenantMembers}
        onSave={saveWidgetConfig}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear painel</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Nome do painel"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitRename()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmId != null}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir painel?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação não pode ser desfeita. Todos os cartões deste painel serão perdidos.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteBoard()}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
