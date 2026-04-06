"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Configurar cartão</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Fonte de dados, cálculo, medida e filtros (referência ClickUp).
          </p>
        </DialogHeader>
        <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-auto shrink-0 justify-start">
            <TabsTrigger value="config">Configurações</TabsTrigger>
            <TabsTrigger value="filters">Filtros</TabsTrigger>
          </TabsList>
          <TabsContent
            value="config"
            className="mt-0 flex-1 overflow-y-auto px-6 pb-4 pt-4"
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dw-title">Título (opcional)</Label>
                <Input
                  id="dw-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Abordagens — este mês"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dw-pipeline">Fonte de dados</Label>
                <select
                  id="dw-pipeline"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? " (padrão)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dw-data-measure">Dados (medida)</Label>
                <select
                  id="dw-data-measure"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={dataMeasure}
                  onChange={(e) =>
                    setDataMeasure(e.target.value as DataMeasure)
                  }
                >
                  <option value="QUANTITY">Quantidade de deals</option>
                  <option value="MONEY">Dinheiro (valor da oportunidade)</option>
                  <option value="CUSTOM_NUMBER">Número (campo customizado)</option>
                </select>
              </div>
              {dataMeasure !== "QUANTITY" ? (
                <div className="grid gap-2">
                  <Label htmlFor="dw-calc">Cálculo</Label>
                  <select
                    id="dw-calc"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={aggregation}
                    onChange={(e) =>
                      setAggregation(e.target.value as Aggregation)
                    }
                  >
                    <option value="SUM">Somatória</option>
                    <option value="AVG">Média</option>
                  </select>
                </div>
              ) : null}
              {dataMeasure === "CUSTOM_NUMBER" ? (
                <div className="grid gap-2">
                  <Label htmlFor="dw-cf-key">Campo numérico</Label>
                  <select
                    id="dw-cf-key"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={customFieldKey}
                    onChange={(e) => setCustomFieldKey(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {numericCustomFields.map((f) => (
                      <option key={f.id} value={f.key}>
                        {f.name} ({f.fieldType})
                      </option>
                    ))}
                  </select>
                  {numericCustomFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum campo Número ou Dinheiro (R$) em Deals. Crie em
                      Configurações → Campos.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label>Unidades (exibição)</Label>
                <p className="text-xs text-muted-foreground">
                  Automático: contagem inteira, valores em R$ para dinheiro e
                  campos Dinheiro (R$).
                </p>
              </div>
              {!isMetric ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="dw-dim">Agrupar por</Label>
                    <select
                      id="dw-dim"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(dimension || "BY_STAGE") === "BY_DAY" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="dw-days">Dias</Label>
                      <Input
                        id="dw-days"
                        type="number"
                        min={1}
                        max={366}
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value) || 30)}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent
            value="filters"
            className="mt-0 flex-1 overflow-y-auto px-6 pb-4 pt-4"
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-3">
                  {STATUS_META.map(({ code, label }) => (
                    <label
                      key={code}
                      className="flex cursor-pointer items-center gap-2 text-sm"
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
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dw-tags">Tags (deals)</Label>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma tag cadastrada.
                  </p>
                ) : (
                  <select
                    id="dw-tags"
                    multiple
                    className="min-h-[88px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
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
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-muted-foreground">
                  Segure Ctrl para várias tags. Deal deve ter todas as tags
                  selecionadas.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="dw-cfrom">Data de criação (de)</Label>
                  <Input
                    id="dw-cfrom"
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="dw-cto">Data de criação (até)</Label>
                  <Input
                    id="dw-cto"
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Campos customizados (filtro)</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Igualidade exata no JSON do deal (mesmo valor salvo no CRM).
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {extraFilters.map((row, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-2"
                    >
                      <div className="grid min-w-[140px] flex-1 gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          Campo
                        </span>
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                          <option value="">—</option>
                          {dealCustomFields.map((f) => (
                            <option key={f.id} value={f.key}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid min-w-[120px] flex-1 gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          Valor
                        </span>
                        <Input
                          className="h-8 text-xs"
                          value={row.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setExtraFilters((rows) =>
                              rows.map((x, j) =>
                                j === i ? { ...x, value: v } : x,
                              ),
                            );
                          }}
                          placeholder="Valor exato"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive"
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
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
