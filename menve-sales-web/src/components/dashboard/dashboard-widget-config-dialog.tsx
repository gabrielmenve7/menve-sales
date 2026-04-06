"use client";

import { useEffect, useState } from "react";
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
import type {
  LayoutWidget,
  PipelineListItem,
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

export function DashboardWidgetConfigDialog({
  open,
  onOpenChange,
  widget,
  pipelines,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  widget: LayoutWidget | null;
  pipelines: PipelineListItem[];
  onSave: (next: LayoutWidget) => void;
}) {
  const [title, setTitle] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [measure, setMeasure] = useState<"COUNT" | "SUM_VALUE">("COUNT");
  const [dimension, setDimension] = useState<
    NonNullable<WidgetQuerySpec["dimension"]> | ""
  >("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!widget || !open) return;
    setTitle(widget.title ?? "");
    setPipelineId(widget.querySpec.pipelineId);
    setMeasure(widget.querySpec.measure);
    setDimension(
      widget.querySpec.dimension === null || widget.querySpec.dimension === undefined
        ? ""
        : widget.querySpec.dimension,
    );
    setIncludeClosed(widget.querySpec.includeClosed ?? false);
    setIncludeArchived(widget.querySpec.includeArchived ?? false);
    setDays(widget.querySpec.days ?? 30);
  }, [widget, open]);

  if (!widget) return null;

  const isMetric = widget.type === "METRIC";

  function handleSave() {
    if (!widget) return;
    const spec: WidgetQuerySpec = {
      source: "DEALS",
      measure,
      pipelineId,
      includeClosed,
      includeArchived,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar cartão</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="dw-title">Título (opcional)</Label>
            <Input
              id="dw-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Total de oportunidades"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dw-pipeline">Funil</Label>
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
            <Label htmlFor="dw-measure">Medida</Label>
            <select
              id="dw-measure"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={measure}
              onChange={(e) =>
                setMeasure(e.target.value as "COUNT" | "SUM_VALUE")
              }
            >
              <option value="COUNT">Quantidade de deals</option>
              <option value="SUM_VALUE">Soma do valor</option>
            </select>
          </div>
          {!isMetric ? (
            <div className="grid gap-2">
              <Label htmlFor="dw-dim">Agrupar por</Label>
              <select
                id="dw-dim"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={dimension || "BY_STAGE"}
                onChange={(e) =>
                  setDimension(
                    e.target.value as NonNullable<WidgetQuerySpec["dimension"]>,
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
          ) : null}
          {dimension === "BY_DAY" && !isMetric ? (
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
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeClosed}
                onChange={(e) => setIncludeClosed(e.target.checked)}
              />
              Mostrar fechados (ganhos e perdidos)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Mostrar arquivados
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!pipelineId}>
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
