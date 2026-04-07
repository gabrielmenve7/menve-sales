"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Filter, Info, Plus, Trash2, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Aggregation,
  BarTimePreset,
  BarXGroupBy,
  DataMeasure,
  DealCustomFieldDef,
  DealStatusCode,
  LayoutWidget,
  PipelineListItem,
  TagListItem,
  WidgetQuerySpec,
  WidgetFilterGroupSaved,
  WidgetFilterRowSaved,
  WidgetType,
} from "@/lib/dashboard-builder-types";
import { defaultBarChartConfig } from "@/lib/dashboard-builder-types";
import { cn } from "@/lib/utils";

const DIMENSION_OPTIONS: {
  value: NonNullable<WidgetQuerySpec["dimension"]> | "";
  label: string;
}[] = [
  { value: "BY_STAGE", label: "Por estágio" },
  { value: "BY_STATUS", label: "Por status" },
  { value: "BY_DAY", label: "Por dia (linha do tempo)" },
];

/** Rótulos do eixo X no modo gráfico de barras (alinhado ao protótipo). */
const BAR_X_DIMENSION_OPTIONS: {
  value: NonNullable<WidgetQuerySpec["dimension"]> | "";
  label: string;
}[] = [
  { value: "BY_STAGE", label: "Estágio" },
  { value: "BY_STATUS", label: "Status" },
  { value: "BY_DAY", label: "Linha do tempo" },
];

const BAR_TIME_PRESET_OPTIONS: { value: BarTimePreset; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "NEXT_MONTH", label: "Próximo mês" },
  { value: "LAST_7_DAYS", label: "Últimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Últimos 30 dias" },
  { value: "LAST_90_DAYS", label: "Últimos 90 dias" },
  { value: "CUSTOM", label: "Personalizado" },
];

const BAR_X_GROUP_OPTIONS: { value: BarXGroupBy; label: string }[] = [
  { value: "DAY", label: "Dias" },
  { value: "WEEK", label: "Semanas" },
  { value: "MONTH", label: "Meses" },
];

function firstDayOfMonthIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstDayOfNextMonthIsoLocal(): string {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function inferBarTimePreset(spec: WidgetQuerySpec): BarTimePreset {
  if (spec.timelineStart) {
    if (spec.timelineStart === firstDayOfNextMonthIsoLocal()) return "NEXT_MONTH";
    if (spec.timelineStart === firstDayOfMonthIsoLocal()) return "THIS_MONTH";
    return "CUSTOM";
  }
  const d = spec.days ?? 30;
  if (d === 7) return "LAST_7_DAYS";
  if (d === 30) return "LAST_30_DAYS";
  if (d === 90) return "LAST_90_DAYS";
  return "CUSTOM";
}

function BarConfigToggle({
  checked,
  onCheckedChange,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {label}
      </Label>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-0.5 block size-5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}

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

function dealCustomFieldSelectOptions(cf: DealCustomFieldDef | undefined) {
  if (!cf || cf.fieldType !== "SELECT") return [];
  const raw = cf.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter((s) => s.length > 0);
}

/** Um único `<select>`: valor da opção codifica par chave + opção do campo SELECT. */
function encodeDashCustomFieldPair(key: string, value: string): string {
  return JSON.stringify([key, value]);
}

function decodeDashCustomFieldPair(
  raw: string,
): { key: string; value: string } | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as unknown;
    if (
      Array.isArray(a) &&
      a.length === 2 &&
      typeof a[0] === "string" &&
      typeof a[1] === "string"
    ) {
      return { key: a[0], value: a[1] };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function dashCustomFieldPairIsValid(
  key: string,
  value: string,
  dealCustomFields: DealCustomFieldDef[],
): boolean {
  if (!key || !value) return false;
  const f = dealCustomFields.find((c) => c.key === key);
  return dealCustomFieldSelectOptions(f).includes(value);
}

function DashCustomFieldFilterSelect({
  rowKey,
  rowValue,
  dealCustomFields,
  selectClass,
  mutedClass,
  onPick,
}: {
  rowKey: string;
  rowValue: string;
  dealCustomFields: DealCustomFieldDef[];
  selectClass: string;
  mutedClass: string;
  onPick: (key: string, value: string) => void;
}) {
  const fieldsWithOpts = dealCustomFields.filter(
    (f) => dealCustomFieldSelectOptions(f).length > 0,
  );
  if (fieldsWithOpts.length === 0) {
    return (
      <p className={cn(mutedClass, "py-2")}>
        Nenhum campo em lista no funil para filtrar.
      </p>
    );
  }
  const selectValue = dashCustomFieldPairIsValid(
    rowKey,
    rowValue,
    dealCustomFields,
  )
    ? encodeDashCustomFieldPair(rowKey, rowValue)
    : "";
  return (
    <select
      className={cn(selectClass, "min-w-[12rem]")}
      value={selectValue}
      onChange={(e) => {
        const parsed = decodeDashCustomFieldPair(e.target.value);
        onPick(parsed?.key ?? "", parsed?.value ?? "");
      }}
      aria-label="Campo e valor"
    >
      <option value="" className="bg-popover text-popover-foreground">
        Selecionar opção
      </option>
      {fieldsWithOpts.map((f) => (
        <optgroup key={f.id} label={f.name}>
          {dealCustomFieldSelectOptions(f).map((opt) => (
            <option
              key={`${f.key}:${opt}`}
              value={encodeDashCustomFieldPair(f.key, opt)}
              className="bg-popover text-popover-foreground"
            >
              {opt}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
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
  "min-w-[15rem] shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const opSelectClass = cn(
  "h-10 w-[4.75rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const rowJoinSelectClass = cn(
  "h-10 w-[3.25rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-center text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const groupJoinSelectClass = cn(
  "h-9 w-[3.5rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-center text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

type DashFilterField = "status" | "tags" | "createdAt" | "customField";

/** é = um valor / todas as tags; ou = vários status ou qualquer tag. */
type DashFilterOp = "IS" | "OR";

type DashRowJoin = "AND" | "OR";
type DashGroupJoin = "AND" | "OR";

const DASH_FIELD_LABELS: Record<DashFilterField, string> = {
  status: "Status",
  tags: "Tags",
  createdAt: "Data de criação",
  customField: "Campo customizado",
};

type DashFilterRow =
  | {
      id: string;
      rowJoin?: DashRowJoin;
      field: "status";
      op: DashFilterOp;
      statusCodes: DealStatusCode[];
    }
  | {
      id: string;
      rowJoin?: DashRowJoin;
      field: "tags";
      op: DashFilterOp;
      tagIds: string[];
    }
  | {
      id: string;
      rowJoin?: DashRowJoin;
      field: "createdAt";
      op: "IS";
      createdFrom: string;
      createdTo: string;
    }
  | {
      id: string;
      rowJoin?: DashRowJoin;
      field: "customField";
      op: "IS";
      key: string;
      value: string;
    };

type DashFilterGroupState = {
  id: string;
  /** Liga este grupo ao anterior (índice ≥ 1). */
  groupJoin?: DashGroupJoin;
  rows: DashFilterRow[];
};

function newRowId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `dw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function statusOpAndCodesFromSpec(spec: WidgetQuerySpec): {
  op: DashFilterOp;
  codes: DealStatusCode[];
} {
  const rec = statusesFromSpec(spec);
  const codes = STATUS_META.filter((x) => rec[x.code]).map((x) => x.code);
  if (codes.length === 0) return { op: "IS", codes: ["OPEN"] };
  if (codes.length === 1) return { op: "IS", codes };
  return { op: "OR", codes };
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
      return { id, field: "status", op: "IS", statusCodes: ["OPEN"] };
    case "tags":
      return { id, field: "tags", op: "IS", tagIds: [] };
    case "createdAt":
      return { id, field: "createdAt", op: "IS", createdFrom: "", createdTo: "" };
    case "customField":
      return { id, field: "customField", op: "IS", key: "", value: "" };
  }
}

function legacyFlatRowsFromSpec(spec: WidgetQuerySpec): DashFilterRow[] {
  const { op: stOp, codes: stCodes } = statusOpAndCodesFromSpec(spec);
  const rows: DashFilterRow[] = [
    {
      id: newRowId(),
      field: "status",
      op: stOp,
      statusCodes: stCodes,
    },
  ];
  if (spec.filterTagIds && spec.filterTagIds.length > 0) {
    rows.push({
      id: newRowId(),
      field: "tags",
      op: spec.filterTagMatch === "ANY" ? "OR" : "IS",
      tagIds: [...spec.filterTagIds],
    });
  }
  if (spec.filterCreatedFrom || spec.filterCreatedTo) {
    rows.push({
      id: newRowId(),
      field: "createdAt",
      op: "IS",
      createdFrom: spec.filterCreatedFrom ?? "",
      createdTo: spec.filterCreatedTo ?? "",
    });
  }
  for (const f of spec.filterCustomFields ?? []) {
    rows.push({
      id: newRowId(),
      field: "customField",
      op: "IS",
      key: f.key,
      value:
        typeof f.value === "boolean"
          ? String(f.value)
          : String(f.value ?? ""),
    });
  }
  return rows;
}

function savedRowToDashRow(id: string, r: WidgetFilterRowSaved): DashFilterRow {
  switch (r.field) {
    case "status":
      return {
        id,
        field: "status",
        op: (r.op as DashFilterOp) ?? "IS",
        statusCodes:
          r.statusCodes && r.statusCodes.length > 0 ? r.statusCodes : ["OPEN"],
      };
    case "tags":
      return {
        id,
        field: "tags",
        op: r.op === "OR" || r.filterTagMatch === "ANY" ? "OR" : "IS",
        tagIds: r.tagIds ? [...r.tagIds] : [],
      };
    case "createdAt":
      return {
        id,
        field: "createdAt",
        op: "IS",
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
      };
    case "customField":
      return {
        id,
        field: "customField",
        op: "IS",
        key: r.customKey ?? "",
        value:
          r.customValue === undefined || r.customValue === null
            ? ""
            : String(r.customValue),
      };
  }
}

function dashRowToSaved(row: DashFilterRow): WidgetFilterRowSaved {
  const rowJoin = row.rowJoin;
  switch (row.field) {
    case "status":
      return {
        rowJoin,
        field: "status",
        op: row.op,
        statusCodes: row.statusCodes,
      };
    case "tags":
      return {
        rowJoin,
        field: "tags",
        op: row.op,
        tagIds: row.tagIds,
        filterTagMatch: row.op === "OR" ? "ANY" : "ALL",
      };
    case "createdAt":
      return {
        rowJoin,
        field: "createdAt",
        op: "IS",
        createdFrom: row.createdFrom || undefined,
        createdTo: row.createdTo || undefined,
      };
    case "customField":
      return {
        rowJoin,
        field: "customField",
        op: "IS",
        customKey: row.key || undefined,
        customValue: row.value || undefined,
      };
  }
}

function specToFilterGroups(spec: WidgetQuerySpec): DashFilterGroupState[] {
  if (spec.filterGroups && spec.filterGroups.length > 0) {
    return spec.filterGroups.map((g, gi) => ({
      id: newRowId(),
      groupJoin: gi === 0 ? undefined : g.groupJoin ?? "OR",
      rows: g.rows.map((r, ri) => {
        const id = newRowId();
        const dr = savedRowToDashRow(id, r);
        return ri === 0 ? dr : { ...dr, rowJoin: r.rowJoin ?? "AND" };
      }),
    }));
  }
  const flat = legacyFlatRowsFromSpec(spec);
  return [
    {
      id: newRowId(),
      rows: flat.map((r, ri) =>
        ri === 0 ? r : { ...r, rowJoin: "AND" as const },
      ),
    },
  ];
}

function defaultFilterGroup(): DashFilterGroupState {
  return {
    id: newRowId(),
    rows: [createDashFilterRow("status")],
  };
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
    "w-[min(42rem,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-2xl sm:max-w-3xl",
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
  const [dialogTab, setDialogTab] = useState("config");
  const [barShowAverage, setBarShowAverage] = useState(true);
  const [barShowLabels, setBarShowLabels] = useState(false);
  const [barShowLegend, setBarShowLegend] = useState(false);
  const [barTimePreset, setBarTimePreset] = useState<BarTimePreset>("LAST_30_DAYS");
  /** Com este/próximo mês: eixo com todos os dias do mês (futuros = 0) vs só até hoje. */
  const [barFillFullMonth, setBarFillFullMonth] = useState(false);
  const [barCustomDays, setBarCustomDays] = useState(30);
  const [barXGroupBy, setBarXGroupBy] = useState<BarXGroupBy>("DAY");
  const [filterGroups, setFilterGroups] = useState<DashFilterGroupState[]>(() => [
    defaultFilterGroup(),
  ]);

  const numericCustomFields = useMemo(
    () => dealCustomFields.filter(numericFieldTypes),
    [dealCustomFields],
  );

  useEffect(() => {
    if (open) setDialogTab("config");
  }, [open]);

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
    setFilterGroups(specToFilterGroups(s));
    if (widget.type === "BAR") {
      const bc = { ...defaultBarChartConfig(), ...widget.barChart };
      setBarShowAverage(bc.showAverageLine ?? true);
      setBarShowLabels(bc.showDataLabels ?? false);
      setBarShowLegend(bc.showLegend ?? false);
      setBarTimePreset(bc.timePreset ?? inferBarTimePreset(s));
      setBarFillFullMonth(s.fillTimelineMonth === true);
      setBarXGroupBy(bc.xGroupBy ?? "DAY");
      setBarCustomDays(s.days ?? 30);
    }
  }, [widget, open]);

  const filtersAreDefault = useMemo(() => {
    if (filterGroups.length !== 1) return false;
    const rows = filterGroups[0]?.rows ?? [];
    if (rows.length !== 1) return false;
    const r = rows[0];
    if (r?.field !== "status") return false;
    return (
      r.op === "IS" &&
      r.statusCodes.length === 1 &&
      r.statusCodes[0] === "OPEN"
    );
  }, [filterGroups]);

  const dataTabBadgeCount = useMemo(() => {
    if (filtersAreDefault) return 0;
    return filterGroups.reduce((n, g) => n + g.rows.length, 0);
  }, [filterGroups, filtersAreDefault]);

  if (!widget) return null;

  const isMetric = widget.type === "METRIC";
  const isBar = widget.type === "BAR";

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

  function selectableFieldsForRow(
    groupRows: DashFilterRow[],
    rowId: string,
  ): DashFilterField[] {
    const taken = fieldsTakenByOthers(groupRows, rowId);
    const current = groupRows.find((r) => r.id === rowId)?.field;
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

  function removeFilterRow(groupId: string, rowId: string) {
    setFilterGroups((prev) => {
      const next = prev
        .map((g) => {
          if (g.id !== groupId) return g;
          const rows = g.rows.filter((r) => r.id !== rowId);
          return {
            ...g,
            rows:
              rows.length > 0 ? rows : [createDashFilterRow("status")],
          };
        })
        .filter((g) => g.rows.length > 0);
      return next.length > 0 ? next : [defaultFilterGroup()];
    });
  }

  function onDashRowFieldChange(
    groupId: string,
    rowId: string,
    field: DashFilterField,
  ) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          rows: g.rows.map((r) => {
            if (r.id !== rowId) return r;
            const next = createDashFilterRowWithId(rowId, field);
            return r.rowJoin ? { ...next, rowJoin: r.rowJoin } : next;
          }),
        };
      }),
    );
  }

  function onDashRowOpChange(
    groupId: string,
    rowId: string,
    op: DashFilterOp,
  ) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          rows: g.rows.map((r) => {
            if (r.id !== rowId) return r;
            if (r.field === "status") {
              if (op === "IS") {
                const first = r.statusCodes[0] ?? "OPEN";
                return { ...r, op, statusCodes: [first] };
              }
              return { ...r, op };
            }
            if (r.field === "tags") {
              return { ...r, op };
            }
            return r;
          }),
        };
      }),
    );
  }

  function onRowJoinChange(
    groupId: string,
    rowId: string,
    join: DashRowJoin,
  ) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          rows: g.rows.map((r) =>
            r.id === rowId ? { ...r, rowJoin: join } : r,
          ),
        };
      }),
    );
  }

  function onGroupJoinChange(groupId: string, join: DashGroupJoin) {
    setFilterGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, groupJoin: join } : g,
      ),
    );
  }

  function addRowToGroup(groupId: string) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const next = nextFieldToAdd(g.rows);
        if (!next) return g;
        return {
          ...g,
          rows: [
            ...g.rows,
            { ...createDashFilterRow(next), rowJoin: "AND" as const },
          ],
        };
      }),
    );
  }

  function addRowToLastGroup() {
    const last = filterGroups[filterGroups.length - 1];
    if (last) addRowToGroup(last.id);
  }

  function addGroupedFilterAfter(groupId: string) {
    setFilterGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === groupId);
      if (idx < 0) return prev;
      const insert: DashFilterGroupState = {
        id: newRowId(),
        groupJoin: "OR",
        rows: [createDashFilterRow("status")],
      };
      return [...prev.slice(0, idx + 1), insert, ...prev.slice(idx + 1)];
    });
  }

  function removeGroup(groupId: string) {
    setFilterGroups((prev) => {
      const next = prev.filter((g) => g.id !== groupId);
      return next.length > 0 ? next : [defaultFilterGroup()];
    });
  }

  function clearDashFilters() {
    setFilterGroups([defaultFilterGroup()]);
  }

  function handleSave() {
    if (!widget) return;

    const filterGroupsPayload: WidgetFilterGroupSaved[] = filterGroups.map(
      (g, gi) => ({
        groupJoin: gi === 0 ? undefined : g.groupJoin ?? "OR",
        rows: g.rows.map((r, ri) => {
          const s = dashRowToSaved(r);
          if (ri === 0) {
            const { rowJoin: _rj, ...rest } = s;
            return rest;
          }
          return s;
        }),
      }),
    );

    const spec: WidgetQuerySpec = {
      source: "DEALS",
      pipelineId,
      dataMeasure,
      aggregation: dataMeasure === "QUANTITY" ? "SUM" : aggregation,
      customFieldKey:
        dataMeasure === "CUSTOM_NUMBER" ? customFieldKey || undefined : undefined,
      filterGroups: filterGroupsPayload,
    };

    if (isMetric) {
      spec.dimension = null;
      delete spec.timelineStart;
      delete spec.fillTimelineMonth;
      delete spec.days;
    } else if (isBar) {
      spec.dimension = (dimension || "BY_STAGE") as NonNullable<
        WidgetQuerySpec["dimension"]
      >;
      if (spec.dimension === "BY_DAY") {
        if (barTimePreset === "THIS_MONTH") {
          spec.timelineStart = firstDayOfMonthIsoLocal();
          spec.fillTimelineMonth = barFillFullMonth;
          delete spec.days;
        } else if (barTimePreset === "NEXT_MONTH") {
          spec.timelineStart = firstDayOfNextMonthIsoLocal();
          spec.fillTimelineMonth = barFillFullMonth;
          delete spec.days;
        } else if (barTimePreset === "LAST_7_DAYS") {
          delete spec.timelineStart;
          delete spec.fillTimelineMonth;
          spec.days = 7;
        } else if (barTimePreset === "LAST_30_DAYS") {
          delete spec.timelineStart;
          delete spec.fillTimelineMonth;
          spec.days = 30;
        } else if (barTimePreset === "LAST_90_DAYS") {
          delete spec.timelineStart;
          delete spec.fillTimelineMonth;
          spec.days = 90;
        } else {
          delete spec.timelineStart;
          delete spec.fillTimelineMonth;
          spec.days = Math.min(366, Math.max(1, barCustomDays));
        }
      } else {
        delete spec.timelineStart;
        delete spec.fillTimelineMonth;
        delete spec.days;
      }
    } else {
      spec.dimension = (dimension || "BY_STAGE") as NonNullable<
        WidgetQuerySpec["dimension"]
      >;
      delete spec.timelineStart;
      delete spec.fillTimelineMonth;
      if (spec.dimension === "BY_DAY") {
        spec.days = Math.min(366, Math.max(1, days));
      }
    }

    const next: LayoutWidget = {
      id: widget.id,
      type: widget.type,
      grid: widget.grid,
      title: title.trim() || undefined,
      querySpec: spec,
    };
    if (isBar) {
      next.barChart = {
        showAverageLine: barShowAverage,
        showDataLabels: barShowLabels,
        showLegend: barShowLegend,
        timePreset: barTimePreset,
        xGroupBy: spec.dimension === "BY_DAY" ? barXGroupBy : "DAY",
        yGroupBy: "NONE",
      };
    }
    onSave(next);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={cn(
          "flex max-h-[90vh] flex-col !max-w-none sm:!max-w-3xl",
          panel.shell,
        )}
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
        <Tabs
          value={dialogTab}
          onValueChange={setDialogTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList
            className={`mx-6 mt-3 w-auto shrink-0 justify-start bg-transparent ${panel.tabsList}`}
          >
            <TabsTrigger value="config">Configurações</TabsTrigger>
            <TabsTrigger value="filters" className="relative">
              {isBar ? "Dados" : "Filtros"}
              {isBar && dataTabBadgeCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="ml-1.5 min-w-5 px-1 py-0 text-[10px] leading-none"
                >
                  {dataTabBadgeCount}
                </Badge>
              ) : null}
            </TabsTrigger>
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
              {isBar ? (
                <>
                  <div className={`grid gap-2 border-t pt-5 ${panel.divider}`}>
                    <Label htmlFor="dw-pipeline" className="text-foreground">
                      Fonte de dados
                    </Label>
                    <div className="flex flex-wrap items-stretch gap-2">
                      <select
                        id="dw-pipeline"
                        className={cn(panel.control, "min-w-0 flex-1")}
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
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="relative h-9 w-9 shrink-0"
                        onClick={() => setDialogTab("filters")}
                        aria-label="Abrir dados e filtros"
                      >
                        <Filter className="size-4" strokeWidth={2} />
                        {dataTabBadgeCount > 0 ? (
                          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                            {dataTabBadgeCount}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  </div>
                  <div className={`grid gap-1 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Tela</p>
                    <BarConfigToggle
                      id="dw-bar-avg"
                      label="Mostrar linha média"
                      checked={barShowAverage}
                      onCheckedChange={setBarShowAverage}
                    />
                    <BarConfigToggle
                      id="dw-bar-labels"
                      label="Mostrar rótulos de dados"
                      checked={barShowLabels}
                      onCheckedChange={setBarShowLabels}
                    />
                    <BarConfigToggle
                      id="dw-bar-legend"
                      label="Mostrar legenda"
                      checked={barShowLegend}
                      onCheckedChange={setBarShowLegend}
                    />
                  </div>
                  <div className={`grid gap-3 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Eixo X</p>
                    <div className="grid gap-1.5">
                      <Label htmlFor="dw-bar-x-measure" className="text-foreground">
                        Medida
                      </Label>
                      <select
                        id="dw-bar-x-measure"
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
                        {BAR_X_DIMENSION_OPTIONS.map((o) => (
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
                      <>
                        <div className="grid gap-1.5">
                          <Label htmlFor="dw-bar-time" className="text-foreground">
                            Período de tempo
                          </Label>
                          <select
                            id="dw-bar-time"
                            className={panel.control}
                            value={barTimePreset}
                            onChange={(e) =>
                              setBarTimePreset(e.target.value as BarTimePreset)
                            }
                          >
                            {BAR_TIME_PRESET_OPTIONS.map((o) => (
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
                        {barTimePreset === "THIS_MONTH" ||
                        barTimePreset === "NEXT_MONTH" ? (
                          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                            <BarConfigToggle
                              id="dw-bar-fill-month"
                              label="Eixo: mês completo"
                              checked={barFillFullMonth}
                              onCheckedChange={setBarFillFullMonth}
                            />
                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                              Ligado, mostra todos os dias do mês (futuros com
                              zero). Desligado, só até hoje — o gráfico cresce
                              dia a dia.
                            </p>
                          </div>
                        ) : null}
                        {barTimePreset === "CUSTOM" ? (
                          <div className="grid gap-1.5">
                            <Label
                              htmlFor="dw-bar-custom-days"
                              className="text-foreground"
                            >
                              Dias na janela
                            </Label>
                            <Input
                              id="dw-bar-custom-days"
                              type="number"
                              min={1}
                              max={366}
                              value={barCustomDays}
                              onChange={(e) =>
                                setBarCustomDays(Number(e.target.value) || 30)
                              }
                              className={panel.control}
                            />
                          </div>
                        ) : null}
                        <div className="grid gap-1.5">
                          <Label htmlFor="dw-bar-x-group" className="text-foreground">
                            Agrupar por
                          </Label>
                          <select
                            id="dw-bar-x-group"
                            className={panel.control}
                            value={barXGroupBy}
                            onChange={(e) =>
                              setBarXGroupBy(e.target.value as BarXGroupBy)
                            }
                          >
                            {BAR_X_GROUP_OPTIONS.map((o) => (
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
                      </>
                    ) : null}
                  </div>
                  <div className={`grid gap-3 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Eixo Y</p>
                    <div className="grid gap-1.5">
                      <Label htmlFor="dw-bar-y-measure" className="text-foreground">
                        Medida
                      </Label>
                      <select
                        id="dw-bar-y-measure"
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
                          Número de deals
                        </option>
                        <option
                          value="MONEY"
                          className="bg-popover text-popover-foreground"
                        >
                          Valor (R$)
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
                        <Label htmlFor="dw-bar-y-calc" className="text-foreground">
                          Cálculo
                        </Label>
                        <select
                          id="dw-bar-y-calc"
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
                        <Label htmlFor="dw-bar-cf-key" className="text-foreground">
                          Campo
                        </Label>
                        <select
                          id="dw-bar-cf-key"
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
                    <div className="grid gap-1.5">
                      <Label htmlFor="dw-bar-y-group" className="text-foreground">
                        Agrupar por
                      </Label>
                      <select
                        id="dw-bar-y-group"
                        className={cn(panel.control, "opacity-80")}
                        disabled
                        value="NONE"
                      >
                        <option value="NONE">Nenhum</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                      <div
                        className={`grid gap-1.5 border-t pt-5 ${panel.divider}`}
                      >
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
                            onChange={(e) =>
                              setDays(Number(e.target.value) || 30)
                            }
                            className={panel.control}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="filters"
            className="mt-0 flex-1 overflow-y-auto px-6 pb-4 pt-4 focus-visible:outline-none"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {isBar ? "Dados e filtros" : "Filtros de cartões"}
                </p>
                <span
                  className="inline-flex text-muted-foreground"
                  title="Dentro do grupo: «Onde» inicia; «E»/«Ou» liga cada linha seguinte (filtro duplo). Entre grupos: «E»/«Ou» define como combinar grupos (filtro agrupado)."
                >
                  <Info className="size-3.5" strokeWidth={2} aria-hidden />
                </span>
              </div>
            </div>

            {filterGroups.map((group, gi) => (
              <Fragment key={group.id}>
                {gi > 0 ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select
                      className={groupJoinSelectClass}
                      value={group.groupJoin ?? "OR"}
                      onChange={(e) =>
                        onGroupJoinChange(
                          group.id,
                          e.target.value as DashGroupJoin,
                        )
                      }
                      aria-label="Combinar com grupo anterior"
                    >
                      <option value="AND">E</option>
                      <option value="OR">Ou</option>
                    </select>
                    <span className="text-xs text-muted-foreground">
                      entre grupos
                    </span>
                  </div>
                ) : null}
                <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Grupo {gi + 1}
                    </span>
                    {filterGroups.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => removeGroup(group.id)}
                      >
                        Remover grupo
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((row, ri) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 border-b border-border/30 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center"
                  >
                    <div className="flex w-full shrink-0 items-center justify-end sm:w-[4.75rem] sm:justify-center">
                      {ri === 0 ? (
                        <span className="text-sm font-medium text-muted-foreground">
                          Onde
                        </span>
                      ) : (
                        <select
                          className={rowJoinSelectClass}
                          value={row.rowJoin ?? "AND"}
                          onChange={(e) =>
                            onRowJoinChange(
                              group.id,
                              row.id,
                              e.target.value as DashRowJoin,
                            )
                          }
                          aria-label="Combinar com linha anterior"
                        >
                          <option value="AND">E</option>
                          <option value="OR">Ou</option>
                        </select>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <select
                        className={fieldSelectClass}
                        value={row.field}
                        onChange={(e) =>
                          onDashRowFieldChange(
                            group.id,
                            row.id,
                            e.target.value as DashFilterField,
                          )
                        }
                        aria-label="Categoria do filtro"
                      >
                        {selectableFieldsForRow(group.rows, row.id).map((f) => (
                          <option
                            key={f}
                            value={f}
                            className="bg-popover text-popover-foreground"
                          >
                            {DASH_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                      {row.field === "status" || row.field === "tags" ? (
                        <select
                          className={opSelectClass}
                          value={row.op}
                          onChange={(e) =>
                            onDashRowOpChange(
                              group.id,
                              row.id,
                              e.target.value as DashFilterOp,
                            )
                          }
                          aria-label="Operador"
                        >
                          <option value="IS">é</option>
                          <option value="OR">ou</option>
                        </select>
                      ) : (
                        <select
                          className={cn(opSelectClass, "text-muted-foreground")}
                          value="IS"
                          disabled
                          aria-label="Operador"
                        >
                          <option value="IS">é</option>
                        </select>
                      )}
                      {row.field === "status" ? (
                        row.op === "IS" ? (
                          <select
                            className={selectClass}
                            value={row.statusCodes[0] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value as DealStatusCode;
                              setFilterGroups((prev) =>
                                prev.map((g) => {
                                  if (g.id !== group.id) return g;
                                  return {
                                    ...g,
                                    rows: g.rows.map((r) =>
                                      r.id === row.id && r.field === "status"
                                        ? {
                                            ...r,
                                            statusCodes: v ? [v] : [],
                                          }
                                        : r,
                                    ),
                                  };
                                }),
                              );
                            }}
                            aria-label="Valor do status"
                          >
                            <option value="">Selecionar opção</option>
                            {STATUS_META.map(({ code, label }) => (
                              <option
                                key={code}
                                value={code}
                                className="bg-popover text-popover-foreground"
                              >
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            multiple
                            className={cn(selectClass, "min-h-[88px] py-1.5")}
                            value={row.statusCodes}
                            onChange={(e) => {
                              const v = Array.from(
                                e.target.selectedOptions,
                                (o) => o.value,
                              ) as DealStatusCode[];
                              setFilterGroups((prev) =>
                                prev.map((g) => {
                                  if (g.id !== group.id) return g;
                                  return {
                                    ...g,
                                    rows: g.rows.map((r) =>
                                      r.id === row.id && r.field === "status"
                                        ? { ...r, statusCodes: v }
                                        : r,
                                    ),
                                  };
                                }),
                              );
                            }}
                            aria-label="Status (um ou mais)"
                          >
                            {STATUS_META.map(({ code, label }) => (
                              <option
                                key={code}
                                value={code}
                                className="bg-popover text-popover-foreground"
                              >
                                {label}
                              </option>
                            ))}
                          </select>
                        )
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
                                setFilterGroups((prev) =>
                                  prev.map((g) => {
                                    if (g.id !== group.id) return g;
                                    return {
                                      ...g,
                                      rows: g.rows.map((r) =>
                                        r.id === row.id && r.field === "tags"
                                          ? { ...r, tagIds: v }
                                          : r,
                                      ),
                                    };
                                  }),
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
                              Ctrl + clique para várias.
                              {row.op === "IS"
                                ? " Com «é», o deal precisa ter todas."
                                : " Com «ou», basta uma das tags."}
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
                                setFilterGroups((prev) =>
                                  prev.map((g) => {
                                    if (g.id !== group.id) return g;
                                    return {
                                      ...g,
                                      rows: g.rows.map((r) =>
                                        r.id === row.id &&
                                        r.field === "createdAt"
                                          ? {
                                              ...r,
                                              createdFrom: e.target.value,
                                            }
                                          : r,
                                      ),
                                    };
                                  }),
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
                                setFilterGroups((prev) =>
                                  prev.map((g) => {
                                    if (g.id !== group.id) return g;
                                    return {
                                      ...g,
                                      rows: g.rows.map((r) =>
                                        r.id === row.id &&
                                        r.field === "createdAt"
                                          ? {
                                              ...r,
                                              createdTo: e.target.value,
                                            }
                                          : r,
                                      ),
                                    };
                                  }),
                                )
                              }
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      ) : null}
                      {row.field === "customField" ? (
                        <DashCustomFieldFilterSelect
                          rowKey={row.key}
                          rowValue={row.value}
                          dealCustomFields={dealCustomFields}
                          selectClass={selectClass}
                          mutedClass={panel.muted}
                          onPick={(key, value) =>
                            setFilterGroups((prev) =>
                              prev.map((g) => {
                                if (g.id !== group.id) return g;
                                return {
                                  ...g,
                                  rows: g.rows.map((r) =>
                                    r.id === row.id &&
                                    r.field === "customField"
                                      ? { ...r, key, value }
                                      : r,
                                  ),
                                };
                              }),
                            )
                          }
                        />
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0 self-end text-muted-foreground hover:text-destructive sm:self-start"
                      aria-label="Remover filtro"
                      onClick={() => removeFilterRow(group.id, row.id)}
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
                    onClick={() => addGroupedFilterAfter(group.id)}
                  >
                    Adicionar filtro agrupado
                  </Button>
                </div>
              </Fragment>
            ))}

            <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={addRowToLastGroup}
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
