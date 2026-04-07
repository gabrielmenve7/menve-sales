"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Aggregation,
  DataMeasure,
  DealCustomFieldDef,
  DealStatusCode,
  LayoutWidget,
  PipelineListItem,
  TagListItem,
  WidgetQuerySpec,
  WidgetType,
} from "@/lib/dashboard-builder-types";

const DIMENSION_OPTIONS: {
  value: NonNullable<WidgetQuerySpec["dimension"]> | "";
  label: string;
}[] = [
  { value: "BY_STAGE", label: "Por estágio" },
  { value: "BY_STATUS", label: "Por status" },
  { value: "BY_DAY", label: "Por dia (linha do tempo)" },
];

const STATUS_META: { code: DealStatusCode; label: string }[] = [
  { code: "OPEN", label: "Aberto" },
  { code: "WON", label: "Ganho" },
  { code: "LOST", label: "Perdido" },
  { code: "ARCHIVED", label: "Arquivado" },
];

function statusesFromSpec(spec: WidgetQuerySpec): Record<DealStatusCode, boolean> {
  if (spec.filterStatuses && spec.filterStatuses.length > 0) {
    const m: Record<DealStatusCode, boolean> = {
      OPEN: false,
      WON: false,
      LOST: false,
      ARCHIVED: false,
    };
    for (const s of spec.filterStatuses) {
      m[s] = true;
    }
    return m;
  }
  return {
    OPEN: true,
    WON: spec.includeClosed ?? false,
    LOST: spec.includeClosed ?? false,
    ARCHIVED: spec.includeArchived ?? false,
  };
}

function numericFieldTypes(f: DealCustomFieldDef) {
  return f.fieldType === "NUMBER" || f.fieldType === "MONEY_BRL";
}

/** Estilos alinhados ao tema (light/dark via tokens do app). */
const panel = {
  shell:
    "max-w-lg gap-0 overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-2xl sm:max-w-lg",
  control:
    "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40",
  divider: "border-border",
  muted: "text-xs text-muted-foreground",
  tabsList: "border-border",
} as const;

export function DashboardWidgetConfigDialog({
  open,
  onOpenChange,
  widget,
  pipelines,
  tags,
  dealCustomFields,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  widget: LayoutWidget | null;
  pipelines: PipelineListItem[];
  tags: TagListItem[];
  dealCustomFields: DealCustomFieldDef[];
  onSave: (next: LayoutWidget) => void;
}) {
  const [title, setTitle] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [dataMeasure, setDataMeasure] = useState<DataMeasure>("QUANTITY");
  const [aggregation, setAggregation] = useState<Aggregation>("SUM");
  const [customFieldKey, setCustomFieldKey] = useState("");
  const [dimension, setDimension] = useState<
    NonNullable<WidgetQuerySpec["dimension"]> | ""
  >("");
  const [days, setDays] = useState(30);
  const [statusPick, setStatusPick] = useState<Record<DealStatusCode, boolean>>({
    OPEN: true,
    WON: false,
    LOST: false,
    ARCHIVED: false,
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [extraFilters, setExtraFilters] = useState<{ key: string; value: string }[]>(
    [],
  );

  const numericCustomFields = useMemo(
    () => dealCustomFields.filter(numericFieldTypes),
    [dealCustomFields],
  );

  useEffect(() => {
    if (!widget || !open) return;
    const s = widget.querySpec;
    setTitle(widget.title ?? "");
    setPipelineId(s.pipelineId);
    setDataMeasure(
      s.dataMeasure ??
        (s.measure === "SUM_VALUE"
          ? "MONEY"
          : s.measure === "COUNT"
            ? "QUANTITY"
            : "QUANTITY"),
    );
    setAggregation(s.aggregation ?? "SUM");
    setCustomFieldKey(s.customFieldKey ?? "");
    setDimension(
      s.dimension === null || s.dimension === undefined ? "" : s.dimension,
    );
    setDays(s.days ?? 30);
    setStatusPick(statusesFromSpec(s));
    setTagIds(s.filterTagIds ?? []);
    setCreatedFrom(s.filterCreatedFrom ?? "");
    setCreatedTo(s.filterCreatedTo ?? "");
    setExtraFilters(
      (s.filterCustomFields ?? []).map((f) => ({
        key: f.key,
        value:
          typeof f.value === "boolean"
            ? String(f.value)
            : String(f.value ?? ""),
      })),
    );
  }, [widget, open]);

  if (!widget) return null;

  const isMetric = widget.type === "METRIC";

  function coerceFilterValue(
    key: string,
    raw: string,
  ): string | number | boolean {
    const def = dealCustomFields.find((c) => c.key === key);
    const t = def?.fieldType;
    if (t === "NUMBER" || t === "MONEY_BRL") {
      const n = Number(String(raw).replace(",", "."));
      return Number.isFinite(n) ? n : raw;
    }
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  }

  function handleSave() {
    if (!widget) return;
    const statuses = STATUS_META.filter((x) => statusPick[x.code]).map(
      (x) => x.code,
    );
    const filterStatuses =
      statuses.length > 0 ? statuses : (["OPEN"] as DealStatusCode[]);

    const filterCustomFields =
      extraFilters
        .filter((r) => r.key.trim() && r.value.trim() !== "")
        .map((r) => ({
          key: r.key.trim(),
          value: coerceFilterValue(r.key.trim(), r.value.trim()),
        })) ?? undefined;

    const spec: WidgetQuerySpec = {
      source: "DEALS",
      pipelineId,
      dataMeasure,
      aggregation: dataMeasure === "QUANTITY" ? "SUM" : aggregation,
      customFieldKey:
        dataMeasure === "CUSTOM_NUMBER" ? customFieldKey || undefined : undefined,
      filterStatuses,
      filterTagIds: tagIds.length > 0 ? tagIds : undefined,
      filterCreatedFrom: createdFrom.trim() || undefined,
      filterCreatedTo: createdTo.trim() || undefined,
      filterCustomFields:
        filterCustomFields && filterCustomFields.length > 0
          ? filterCustomFields
          : undefined,
    };

    if (isMetric) {
      spec.dimension = null;
    } else {
      spec.dimension = (dimension || "BY_STAGE") as NonNullable<
        WidgetQuerySpec["dimension"]
      >;
    }
    if (spec.dimension === "BY_DAY") {
      spec.days = Math.min(366, Math.max(1, days));
    }

    const next: LayoutWidget = {
      id: widget.id,
      type: widget.type,
      grid: widget.grid,
      title: title.trim() || undefined,
      querySpec: spec,
    };
    onSave(next);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={`flex max-h-[90vh] flex-col ${panel.shell}`}
      >
        <DialogHeader
          className={`relative border-b px-6 py-4 pr-14 text-left ${panel.divider}`}
        >
          <DialogTitle className="text-base font-semibold text-foreground">
            Configurar cartão
          </DialogTitle>
          <DialogClose
            type="button"
            className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </DialogClose>
        </DialogHeader>
        <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col">
          <TabsList
            className={`mx-6 mt-3 w-auto shrink-0 justify-start bg-transparent ${panel.tabsList}`}
          >
            <TabsTrigger value="config">Configurações</TabsTrigger>
            <TabsTrigger value="filters">Filtros</TabsTrigger>
          </TabsList>
          <TabsContent
            value="config"
            className="mt-0 flex-1 overflow-y-auto px-6 pb-4 pt-4 focus-visible:outline-none"
          >
            <div className="grid gap-5">
              <div className="grid gap-1.5">
                <Label htmlFor="dw-title" className="text-foreground">
                  Título
                </Label>
                <Input
                  id="dw-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Abordagens — este mês"
                  className={panel.control}
                />
              </div>
              <div className={`grid gap-1.5 border-t pt-5 ${panel.divider}`}>
                <Label htmlFor="dw-pipeline" className="text-foreground">
                  Fonte de dados
                </Label>
                <select
                  id="dw-pipeline"
                  className={panel.control}
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                >
                  {pipelines.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-popover text-popover-foreground"
                    >
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`grid gap-1.5 border-t pt-5 ${panel.divider}`}>
                <Label htmlFor="dw-data-measure" className="text-foreground">
                  Dados
                </Label>
                <select
                  id="dw-data-measure"
                  className={panel.control}
                  value={dataMeasure}
                  onChange={(e) =>
                    setDataMeasure(e.target.value as DataMeasure)
                  }
                >
                  <option
                    value="QUANTITY"
                    className="bg-popover text-popover-foreground"
                  >
                    Números de deals
                  </option>
                  <option
                    value="MONEY"
                    className="bg-popover text-popover-foreground"
                  >
                    Dinheiro
                  </option>
                  <option
                    value="CUSTOM_NUMBER"
                    className="bg-popover text-popover-foreground"
                  >
                    Campo customizado
                  </option>
                </select>
              </div>
              {dataMeasure !== "QUANTITY" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="dw-calc" className="text-foreground">
                    Cálculo
                  </Label>
                  <select
                    id="dw-calc"
                    className={panel.control}
                    value={aggregation}
                    onChange={(e) =>
                      setAggregation(e.target.value as Aggregation)
                    }
                  >
                    <option
                      value="SUM"
                      className="bg-popover text-popover-foreground"
                    >
                      Somatória
                    </option>
                    <option
                      value="AVG"
                      className="bg-popover text-popover-foreground"
                    >
                      Média
                    </option>
                  </select>
                </div>
              ) : null}
              {dataMeasure === "CUSTOM_NUMBER" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="dw-cf-key" className="text-foreground">
                    Campo
                  </Label>
                  <select
                    id="dw-cf-key"
                    className={panel.control}
                    value={customFieldKey}
                    onChange={(e) => setCustomFieldKey(e.target.value)}
                  >
                    <option
                      value=""
                      className="bg-popover text-popover-foreground"
                    >
                      Selecione…
                    </option>
                    {numericCustomFields.map((f) => (
                      <option
                        key={f.id}
                        value={f.key}
                        className="bg-popover text-popover-foreground"
                      >
                        {f.name}
                      </option>
                    ))}
                  </select>
                  {numericCustomFields.length === 0 ? (
                    <p className={panel.muted}>
                      Nenhum campo numérico em Deals.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!isMetric ? (
                <>
                  <div className={`grid gap-1.5 border-t pt-5 ${panel.divider}`}>
                    <Label htmlFor="dw-dim" className="text-foreground">
                      Agrupar por
                    </Label>
                    <select
                      id="dw-dim"
                      className={panel.control}
                      value={dimension || "BY_STAGE"}
                      onChange={(e) =>
                        setDimension(
                          e.target.value as NonNullable<
                            WidgetQuerySpec["dimension"]
                          >,
                        )
                      }
                    >
                      {DIMENSION_OPTIONS.map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          className="bg-popover text-popover-foreground"
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(dimension || "BY_STAGE") === "BY_DAY" ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="dw-days" className="text-foreground">
                        Dias
                      </Label>
                      <Input
                        id="dw-days"
                        type="number"
                        min={1}
                        max={366}
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value) || 30)}
                        className={panel.control}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent
            value="filters"
            className="mt-0 flex-1 overflow-y-auto px-6 pb-4 pt-4 focus-visible:outline-none"
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label className="text-foreground">Status</Label>
                <div className="flex flex-wrap gap-3">
                  {STATUS_META.map(({ code, label }) => (
                    <label
                      key={code}
                      className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={statusPick[code]}
                        onChange={(e) =>
                          setStatusPick((p) => ({
                            ...p,
                            [code]: e.target.checked,
                          }))
                        }
                        className="rounded border-input bg-background text-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className={`grid gap-2 border-t pt-5 ${panel.divider}`}>
                <Label htmlFor="dw-tags" className="text-foreground">
                  Tags
                </Label>
                {tags.length === 0 ? (
                  <p className={panel.muted}>Nenhuma tag cadastrada.</p>
                ) : (
                  <select
                    id="dw-tags"
                    multiple
                    className={`min-h-[88px] w-full rounded-lg px-2 py-1 text-sm ${panel.control}`}
                    value={tagIds}
                    onChange={(e) => {
                      const v = Array.from(
                        e.target.selectedOptions,
                        (o) => o.value,
                      );
                      setTagIds(v);
                    }}
                  >
                    {tags.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        className="bg-popover text-popover-foreground"
                      >
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className={panel.muted}>
                  Ctrl + clique para várias. O deal precisa ter todas.
                </p>
              </div>
              <div
                className={`grid gap-3 border-t pt-5 sm:grid-cols-2 ${panel.divider}`}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="dw-cfrom" className="text-foreground">
                    Criado em (de)
                  </Label>
                  <Input
                    id="dw-cfrom"
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                    className={panel.control}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dw-cto" className="text-foreground">
                    Criado em (até)
                  </Label>
                  <Input
                    id="dw-cto"
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                    className={panel.control}
                  />
                </div>
              </div>
              <div className={`grid gap-2 border-t pt-5 ${panel.divider}`}>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-foreground">Campos customizados</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setExtraFilters((r) => [...r, { key: "", value: "" }])
                    }
                  >
                    + Filtro
                  </Button>
                </div>
                {extraFilters.length === 0 ? (
                  <p className={panel.muted}>Valor igual ao salvo no deal.</p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {extraFilters.map((row, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-2"
                    >
                      <div className="grid min-w-[140px] flex-1 gap-1">
                        <Label className="text-foreground">Campo</Label>
                        <select
                          className={`h-8 w-full px-2 text-xs ${panel.control}`}
                          value={row.key}
                          onChange={(e) => {
                            const k = e.target.value;
                            setExtraFilters((rows) =>
                              rows.map((x, j) =>
                                j === i ? { ...x, key: k } : x,
                              ),
                            );
                          }}
                        >
                          <option
                            value=""
                            className="bg-popover text-popover-foreground"
                          >
                            —
                          </option>
                          {dealCustomFields.map((f) => (
                            <option
                              key={f.id}
                              value={f.key}
                              className="bg-popover text-popover-foreground"
                            >
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid min-w-[120px] flex-1 gap-1">
                        <Label className="text-foreground">Valor</Label>
                        <Input
                          className={`h-8 text-xs ${panel.control}`}
                          value={row.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setExtraFilters((rows) =>
                              rows.map((x, j) =>
                                j === i ? { ...x, value: v } : x,
                              ),
                            );
                          }}
                          placeholder="Valor"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          setExtraFilters((rows) =>
                            rows.filter((_, j) => j !== i),
                          )
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter
          className={`border-t px-6 py-4 sm:justify-end ${panel.divider}`}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              !pipelineId ||
              (dataMeasure === "CUSTOM_NUMBER" && !customFieldKey)
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function widgetTypeLabel(t: WidgetType): string {
  switch (t) {
    case "METRIC":
      return "Cálculo (número)";
    case "BAR":
      return "Gráfico de barras";
    case "PIE":
      return "Gráfico de pizza";
    case "DONUT":
      return "Gráfico em anel";
    default:
      return t;
  }
}
