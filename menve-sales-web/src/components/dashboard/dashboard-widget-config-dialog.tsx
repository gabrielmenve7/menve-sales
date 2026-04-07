"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

/** Mesmo padrão visual do filtro do pipeline (`pipeline-view`). */
const selectClass = cn(
  "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const fieldSelectClass = cn(
  "min-w-[13.5rem] shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

type DashFilterField = "status" | "tags" | "createdAt" | "customField";

const DASH_FIELD_LABELS: Record<DashFilterField, string> = {
  status: "Status",
  tags: "Tags",
  createdAt: "Data de criação",
  customField: "Campo customizado",
};

type DashFilterRow =
  | { id: string; field: "status"; status: Record<DealStatusCode, boolean> }
  | { id: string; field: "tags"; tagIds: string[] }
  | { id: string; field: "createdAt"; createdFrom: string; createdTo: string }
  | { id: string; field: "customField"; key: string; value: string };

function newRowId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `dw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultStatusRecord(): Record<DealStatusCode, boolean> {
  return { OPEN: true, WON: false, LOST: false, ARCHIVED: false };
}

function createDashFilterRow(field: DashFilterField): DashFilterRow {
  return createDashFilterRowWithId(newRowId(), field);
}

function createDashFilterRowWithId(
  id: string,
  field: DashFilterField,
): DashFilterRow {
  switch (field) {
    case "status":
      return { id, field: "status", status: defaultStatusRecord() };
    case "tags":
      return { id, field: "tags", tagIds: [] };
    case "createdAt":
      return { id, field: "createdAt", createdFrom: "", createdTo: "" };
    case "customField":
      return { id, field: "customField", key: "", value: "" };
  }
}

function specToFilterRows(spec: WidgetQuerySpec): DashFilterRow[] {
  const rows: DashFilterRow[] = [
    {
      id: newRowId(),
      field: "status",
      status: statusesFromSpec(spec),
    },
  ];
  if (spec.filterTagIds && spec.filterTagIds.length > 0) {
    rows.push({
      id: newRowId(),
      field: "tags",
      tagIds: [...spec.filterTagIds],
    });
  }
  if (spec.filterCreatedFrom || spec.filterCreatedTo) {
    rows.push({
      id: newRowId(),
      field: "createdAt",
      createdFrom: spec.filterCreatedFrom ?? "",
      createdTo: spec.filterCreatedTo ?? "",
    });
  }
  for (const f of spec.filterCustomFields ?? []) {
    rows.push({
      id: newRowId(),
      field: "customField",
      key: f.key,
      value:
        typeof f.value === "boolean"
          ? String(f.value)
          : String(f.value ?? ""),
    });
  }
  return rows;
}

function fieldsTakenByOthers(
  rows: DashFilterRow[],
  exceptId: string,
): Set<Exclude<DashFilterField, "customField">> {
  const s = new Set<Exclude<DashFilterField, "customField">>();
  for (const r of rows) {
    if (r.id === exceptId) continue;
    if (r.field !== "customField") s.add(r.field);
  }
  return s;
}

function nextFieldToAdd(rows: DashFilterRow[]): DashFilterField | null {
  const taken = fieldsTakenByOthers(rows, "");
  if (!taken.has("status")) return "status";
  if (!taken.has("tags")) return "tags";
  if (!taken.has("createdAt")) return "createdAt";
  return "customField";
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
  const [filterRows, setFilterRows] = useState<DashFilterRow[]>(() => [
    createDashFilterRow("status"),
  ]);

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
    setFilterRows(specToFilterRows(s));
  }, [widget, open]);

  const filtersAreDefault = useMemo(() => {
    if (filterRows.length !== 1) return false;
    const r = filterRows[0];
    if (r?.field !== "status") return false;
    return (
      r.status.OPEN &&
      !r.status.WON &&
      !r.status.LOST &&
      !r.status.ARCHIVED
    );
  }, [filterRows]);

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

  function selectableFieldsForRow(rowId: string): DashFilterField[] {
    const taken = fieldsTakenByOthers(filterRows, rowId);
    const current = filterRows.find((r) => r.id === rowId)?.field;
    const all: DashFilterField[] = [
      "status",
      "tags",
      "createdAt",
      "customField",
    ];
    return all.filter((f) => {
      if (f === "customField") return true;
      if (f === current) return true;
      return !taken.has(f);
    });
  }

  function removeFilterRow(rowId: string) {
    setFilterRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  function onDashRowFieldChange(rowId: string, field: DashFilterField) {
    setFilterRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? createDashFilterRowWithId(rowId, field) : r,
      ),
    );
  }

  function addDashFilterRow() {
    const next = nextFieldToAdd(filterRows);
    if (!next) return;
    setFilterRows((prev) => [...prev, createDashFilterRow(next)]);
  }

  function clearDashFilters() {
    setFilterRows([createDashFilterRow("status")]);
  }

  function handleSave() {
    if (!widget) return;

    const statusRow = filterRows.find((r) => r.field === "status");
    const statusPick =
      statusRow?.field === "status"
        ? statusRow.status
        : defaultStatusRecord();
    const statuses = STATUS_META.filter((x) => statusPick[x.code]).map(
      (x) => x.code,
    );
    const filterStatuses =
      statuses.length > 0 ? statuses : (["OPEN"] as DealStatusCode[]);

    const tagsRow = filterRows.find((r) => r.field === "tags");
    const tagIds =
      tagsRow?.field === "tags" ? tagsRow.tagIds : [];

    const createdRow = filterRows.find((r) => r.field === "createdAt");
    const createdFrom =
      createdRow?.field === "createdAt" ? createdRow.createdFrom : "";
    const createdTo =
      createdRow?.field === "createdAt" ? createdRow.createdTo : "";

    const extraFromRows = filterRows.filter(
      (r): r is Extract<DashFilterRow, { field: "customField" }> =>
        r.field === "customField",
    );
    const filterCustomFields =
      extraFromRows
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
            <div className="mb-3 flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Filtros</p>
              <span
                className="inline-flex text-muted-foreground"
                title="Cada linha é um critério; o cartão usa todos ao mesmo tempo (E). Em Tags, o deal precisa ter todas as tags selecionadas."
              >
                <Info className="size-3.5" strokeWidth={2} aria-hidden />
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Grupo 1
                </span>
              </div>
              <div className="space-y-2">
                {filterRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 border-b border-border/30 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-start"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                      <select
                        className={fieldSelectClass}
                        value={row.field}
                        onChange={(e) =>
                          onDashRowFieldChange(
                            row.id,
                            e.target.value as DashFilterField,
                          )
                        }
                        aria-label="Campo"
                      >
                        {selectableFieldsForRow(row.id).map((f) => (
                          <option
                            key={f}
                            value={f}
                            className="bg-popover text-popover-foreground"
                          >
                            {DASH_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                      <span className="flex h-10 shrink-0 items-center px-0.5 text-sm text-muted-foreground">
                        é
                      </span>
                      {row.field === "status" ? (
                        <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 py-1">
                          {STATUS_META.map(({ code, label }) => (
                            <label
                              key={code}
                              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={row.status[code]}
                                onChange={(e) =>
                                  setFilterRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id && r.field === "status"
                                        ? {
                                            ...r,
                                            status: {
                                              ...r.status,
                                              [code]: e.target.checked,
                                            },
                                          }
                                        : r,
                                    ),
                                  )
                                }
                                className="rounded border-input bg-background text-primary"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      ) : null}
                      {row.field === "tags" ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          {tags.length === 0 ? (
                            <p className={panel.muted}>
                              Nenhuma tag cadastrada.
                            </p>
                          ) : (
                            <select
                              multiple
                              className={cn(
                                selectClass,
                                "min-h-[88px] py-1.5",
                              )}
                              value={row.tagIds}
                              onChange={(e) => {
                                const v = Array.from(
                                  e.target.selectedOptions,
                                  (o) => o.value,
                                );
                                setFilterRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id && r.field === "tags"
                                      ? { ...r, tagIds: v }
                                      : r,
                                  ),
                                );
                              }}
                              aria-label="Tags"
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
                          {tags.length > 0 ? (
                            <p className={panel.muted}>
                              Ctrl + clique para várias. O deal precisa ter
                              todas.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {row.field === "createdAt" ? (
                        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                          <div className="grid min-w-[8.5rem] flex-1 gap-1">
                            <Label className="text-[10px] text-muted-foreground">
                              De
                            </Label>
                            <Input
                              type="date"
                              value={row.createdFrom}
                              onChange={(e) =>
                                setFilterRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id && r.field === "createdAt"
                                      ? {
                                          ...r,
                                          createdFrom: e.target.value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="grid min-w-[8.5rem] flex-1 gap-1">
                            <Label className="text-[10px] text-muted-foreground">
                              Até
                            </Label>
                            <Input
                              type="date"
                              value={row.createdTo}
                              onChange={(e) =>
                                setFilterRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id && r.field === "createdAt"
                                      ? {
                                          ...r,
                                          createdTo: e.target.value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      ) : null}
                      {row.field === "customField" ? (
                        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                          <select
                            className={cn(selectClass, "min-w-[10rem]")}
                            value={row.key}
                            onChange={(e) =>
                              setFilterRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id && r.field === "customField"
                                    ? { ...r, key: e.target.value }
                                    : r,
                                ),
                              )
                            }
                            aria-label="Campo customizado"
                          >
                            <option
                              value=""
                              className="bg-popover text-popover-foreground"
                            >
                              Selecionar…
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
                          <Input
                            className={cn(selectClass, "min-w-[8rem]")}
                            value={row.value}
                            onChange={(e) =>
                              setFilterRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id && r.field === "customField"
                                    ? { ...r, value: e.target.value }
                                    : r,
                                ),
                              )
                            }
                            placeholder="Valor no deal"
                            aria-label="Valor do filtro"
                          />
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0 self-end text-muted-foreground hover:text-destructive sm:self-start"
                      aria-label="Remover filtro"
                      onClick={() => removeFilterRow(row.id)}
                    >
                      <Trash2 className="size-4" strokeWidth={2} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-8 w-full text-xs text-muted-foreground"
                onClick={addDashFilterRow}
              >
                Adicionar filtro neste grupo
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={addDashFilterRow}
              >
                <Plus className="size-4" strokeWidth={2} />
                Adicionar filtro
              </Button>
            </div>

            {!filtersAreDefault ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={clearDashFilters}
              >
                Limpar filtros
              </Button>
            ) : null}
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
