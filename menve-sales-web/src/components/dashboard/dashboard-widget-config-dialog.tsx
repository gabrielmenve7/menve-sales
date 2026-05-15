"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  History,
  Calendar,
  ChevronsUpDown,
  CircleDot,
  DollarSign,
  Hash,
  Info,
  Kanban,
  Link2,
  ListOrdered,
  Mail,
  Phone,
  Plus,
  Search,
  Tag,
  Trash2,
  Type,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  Aggregation,
  BarSeriesDisplay,
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
import {
  defaultBarChartConfig,
  isWidgetFilterRollingDatePreset,
} from "@/lib/dashboard-builder-types";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";
import {
  parseDateInputString,
  type PipelineDatePreset,
} from "@/app/(dashboard)/pipeline/pipeline-filter-utils";

const DIMENSION_OPTIONS: {
  value: NonNullable<WidgetQuerySpec["dimension"]> | "";
  label: string;
}[] = [
  { value: "BY_STAGE", label: "Por estágio" },
  { value: "BY_STATUS", label: "Por status" },
  { value: "BY_DAY", label: "Por dia (linha do tempo)" },
  { value: "BY_ASSIGNEE", label: "Por responsável" },
  { value: "BY_CUSTOM_VALUE", label: "Por valor de campo" },
  { value: "BY_GOAL_PROGRESS", label: "Meta / atingimento (gauge)" },
];

const BAR_X_STAGE = "x:stage";
const BAR_X_STATUS = "x:status";
const BAR_X_ASSIGNEE = "x:assignee";
const BAR_X_TIMELINE_CREATED = "x:timeline:created";
const BAR_X_TIMELINE_DATE_PREFIX = "x:timeline:date:";
const BAR_X_CUSTOM_PREFIX = "x:custom:";

function barXTimelineDateKey(fieldKey: string): string {
  return `${BAR_X_TIMELINE_DATE_PREFIX}${fieldKey}`;
}

function barXCustomKey(fieldKey: string): string {
  return `${BAR_X_CUSTOM_PREFIX}${fieldKey}`;
}

function parseBarXColumnId(id: string): {
  dimension: NonNullable<WidgetQuerySpec["dimension"]>;
  timelineBucketFieldKey?: string;
  groupByCustomFieldKey?: string;
} {
  if (id === BAR_X_STAGE) return { dimension: "BY_STAGE" };
  if (id === BAR_X_STATUS) return { dimension: "BY_STATUS" };
  if (id === BAR_X_ASSIGNEE) return { dimension: "BY_ASSIGNEE" };
  if (id === BAR_X_TIMELINE_CREATED) return { dimension: "BY_DAY" };
  if (id.startsWith(BAR_X_TIMELINE_DATE_PREFIX)) {
    const key = id.slice(BAR_X_TIMELINE_DATE_PREFIX.length);
    return { dimension: "BY_DAY", timelineBucketFieldKey: key };
  }
  if (id.startsWith(BAR_X_CUSTOM_PREFIX)) {
    return {
      dimension: "BY_CUSTOM_VALUE",
      groupByCustomFieldKey: id.slice(BAR_X_CUSTOM_PREFIX.length),
    };
  }
  return { dimension: "BY_STAGE" };
}

function inferBarXColumnIdFromSpec(
  spec: WidgetQuerySpec,
  _dealCustomFields: DealCustomFieldDef[],
): string {
  const d = spec.dimension;
  if (d === "BY_STAGE") return BAR_X_STAGE;
  if (d === "BY_STATUS") return BAR_X_STATUS;
  if (d === "BY_ASSIGNEE") return BAR_X_ASSIGNEE;
  if (d === "BY_CUSTOM_VALUE" && spec.groupByCustomFieldKey?.trim()) {
    return barXCustomKey(spec.groupByCustomFieldKey.trim());
  }
  if (d === "BY_DAY") {
    const tb = spec.timelineBucketFieldKey?.trim();
    if (!tb) return BAR_X_TIMELINE_CREATED;
    return barXTimelineDateKey(tb);
  }
  return BAR_X_STAGE;
}

function labelForBarXColumnId(
  columnId: string,
  dealCustomFields: DealCustomFieldDef[],
): string {
  if (columnId === BAR_X_STAGE) return "Estágio";
  if (columnId === BAR_X_STATUS) return "Status";
  if (columnId === BAR_X_ASSIGNEE) return "Responsável";
  if (columnId === BAR_X_TIMELINE_CREATED) return "Data de criação";
  if (columnId.startsWith(BAR_X_TIMELINE_DATE_PREFIX)) {
    const k = columnId.slice(BAR_X_TIMELINE_DATE_PREFIX.length);
    return dealCustomFields.find((c) => c.key === k)?.name ?? k;
  }
  if (columnId.startsWith(BAR_X_CUSTOM_PREFIX)) {
    const k = columnId.slice(BAR_X_CUSTOM_PREFIX.length);
    return dealCustomFields.find((c) => c.key === k)?.name ?? k;
  }
  return "Selecionar…";
}

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
          checked ? "bg-primary-solid" : "bg-muted",
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

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Presets do pipeline + data exata (equals no JSON). */
type DashCustomDatePreset = PipelineDatePreset | "exact";

const DASH_DATE_PRESET_LABELS: { id: DashCustomDatePreset; label: string }[] = [
  { id: "all", label: "Selecionar período…" },
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last7", label: "Últimos 7 dias" },
  { id: "thisWeek", label: "Esta semana" },
  { id: "thisMonth", label: "Este mês" },
  { id: "lastMonth", label: "Mês passado" },
  { id: "custom", label: "Intervalo personalizado" },
  { id: "exact", label: "Data exata" },
];

/**
 * Converte o valor digitado na UI para o tipo persistido na API / JSON do deal.
 */
function parseCustomFieldFilterValueForApi(
  key: string,
  valueStr: string,
  defs: DealCustomFieldDef[],
): string | number | boolean | undefined {
  const trimmed = valueStr.trim();
  if (!trimmed) return undefined;
  const cf = defs.find((c) => c.key === key);
  const ft = cf?.fieldType ?? "TEXT";
  switch (ft) {
    case "NUMBER":
    case "MONEY_BRL": {
      const n = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(n)) return undefined;
      return n;
    }
    case "DATE":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
      return trimmed;
    case "EMAIL":
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}

function DashCustomDateSubfilter({
  datePreset,
  dateCustomFrom,
  dateCustomTo,
  exactValue,
  selectClass,
  onChange,
}: {
  datePreset: DashCustomDatePreset;
  dateCustomFrom: string;
  dateCustomTo: string;
  exactValue: string;
  selectClass: string;
  onChange: (p: {
    datePreset?: DashCustomDatePreset;
    dateCustomFrom?: string;
    dateCustomTo?: string;
    value?: string;
  }) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <select
        className={cn(selectClass, "min-w-[11rem]")}
        value={datePreset}
        onChange={(e) =>
          onChange({
            datePreset: e.target.value as DashCustomDatePreset,
            value: "",
            dateCustomFrom: "",
            dateCustomTo: "",
          })
        }
        aria-label="Período"
      >
        {DASH_DATE_PRESET_LABELS.map(({ id, label }) => (
          <option
            key={id}
            value={id}
            className="bg-popover text-popover-foreground"
          >
            {label}
          </option>
        ))}
      </select>
      {datePreset === "custom" ? (
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <div className="grid min-w-[8.5rem] flex-1 gap-1">
            <span className="text-[10px] text-muted-foreground">De</span>
            <Input
              type="date"
              value={dateCustomFrom}
              onChange={(e) => onChange({ dateCustomFrom: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
          <div className="grid min-w-[8.5rem] flex-1 gap-1">
            <span className="text-[10px] text-muted-foreground">Até</span>
            <Input
              type="date"
              value={dateCustomTo}
              onChange={(e) => onChange({ dateCustomTo: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
        </div>
      ) : null}
      {datePreset === "exact" ? (
        <Input
          type="date"
          className={cn(selectClass, "h-10 min-w-[10rem]")}
          value={exactValue}
          onChange={(e) => onChange({ value: e.target.value })}
          aria-label="Data exata"
        />
      ) : null}
    </div>
  );
}

function DashCustomFieldValueByType({
  cf,
  value,
  onChange,
  tenantMembers,
  selectClass,
}: {
  cf: DealCustomFieldDef;
  value: string;
  onChange: (v: string) => void;
  tenantMembers: TenantMemberOption[];
  selectClass: string;
}): ReactNode {
  const opts = dealCustomFieldSelectOptions(cf);
  switch (cf.fieldType) {
    case "SELECT":
      if (opts.length === 0) {
        return (
          <p className="max-w-[14rem] text-xs text-muted-foreground">
            Defina opções deste campo em Configurações → Campos.
          </p>
        );
      }
      return (
        <select
          className={cn(selectClass, "min-w-[10rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Valor da lista"
        >
          <option value="" className="bg-popover text-popover-foreground">
            Selecionar opção
          </option>
          {opts.map((o) => (
            <option
              key={o}
              value={o}
              className="bg-popover text-popover-foreground"
            >
              {o}
            </option>
          ))}
        </select>
      );
    case "NUMBER":
      return (
        <Input
          type="number"
          className={cn(selectClass, "h-10 min-w-[8rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Valor numérico"
        />
      );
    case "MONEY_BRL":
      return (
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          className={cn(selectClass, "h-10 min-w-[8rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Valor em reais"
        />
      );
    case "DATE":
      return null;
    case "USER": {
      const sorted = [...tenantMembers].sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR"),
      );
      return (
        <select
          className={cn(selectClass, "min-w-[12rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Usuário"
        >
          <option value="" className="bg-popover text-popover-foreground">
            Selecionar pessoa
          </option>
          {sorted.map((m) => (
            <option
              key={m.id}
              value={m.id}
              className="bg-popover text-popover-foreground"
            >
              {m.name?.trim() || m.email}
            </option>
          ))}
        </select>
      );
    }
    case "EMAIL":
      return (
        <Input
          type="email"
          className={cn(selectClass, "h-10 min-w-[11rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="E-mail"
        />
      );
    case "URL":
      return (
        <Input
          type="url"
          className={cn(selectClass, "h-10 min-w-[12rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://"
          aria-label="URL"
        />
      );
    case "PHONE":
      return (
        <Input
          type="tel"
          className={cn(selectClass, "h-10 min-w-[10rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Telefone"
        />
      );
    case "TEXT":
    default:
      return (
        <Input
          className={cn(selectClass, "h-10 min-w-[10rem]")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Valor"
        />
      );
  }
}

function DashCustomFieldFilterControls({
  rowKey,
  rowValue,
  datePreset,
  dateCustomFrom,
  dateCustomTo,
  dealCustomFields,
  tenantMembers,
  selectClass,
  mutedClass,
  onPatch,
}: {
  rowKey: string;
  rowValue: string;
  datePreset: DashCustomDatePreset;
  dateCustomFrom: string;
  dateCustomTo: string;
  dealCustomFields: DealCustomFieldDef[];
  tenantMembers: TenantMemberOption[];
  selectClass: string;
  mutedClass: string;
  onPatch: (patch: {
    key?: string;
    value?: string;
    datePreset?: DashCustomDatePreset;
    dateCustomFrom?: string;
    dateCustomTo?: string;
  }) => void;
}) {
  const cf = dealCustomFields.find((f) => f.key === rowKey);

  if (dealCustomFields.length === 0) {
    return (
      <p className={cn(mutedClass, "max-w-md py-1")}>
        Cadastre campos personalizados do deal em Configurações → Campos.
      </p>
    );
  }
  if (!rowKey) {
    return (
      <p className={cn(mutedClass, "py-1")}>
        Escolha um campo na primeira lista.
      </p>
    );
  }
  if (!cf) {
    return (
      <p className={cn(mutedClass, "py-1")}>
        Este campo não existe mais nas configurações.
      </p>
    );
  }
  if (cf.fieldType === "DATE") {
    return (
      <DashCustomDateSubfilter
        datePreset={datePreset}
        dateCustomFrom={dateCustomFrom}
        dateCustomTo={dateCustomTo}
        exactValue={rowValue}
        selectClass={selectClass}
        onChange={(p) => onPatch(p)}
      />
    );
  }
  return (
    <DashCustomFieldValueByType
      cf={cf}
      value={rowValue}
      onChange={(v) => onPatch({ value: v })}
      tenantMembers={tenantMembers}
      selectClass={selectClass}
    />
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

type DashFilterField = "status" | "tags" | "createdAt" | "updatedAt" | "customField";

/** é = um valor / todas as tags; ou = vários status ou qualquer tag. */
type DashFilterOp = "IS" | "OR";

type DashRowJoin = "AND" | "OR";
type DashGroupJoin = "AND" | "OR";

const DASH_BUILTIN_LABELS: Record<
  Exclude<DashFilterField, "customField">,
  string
> = {
  status: "Status",
  tags: "Tags",
  createdAt: "Data de criação",
  updatedAt: "Data de atualização",
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
      field: "updatedAt";
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
      datePreset: DashCustomDatePreset;
      dateCustomFrom: string;
      dateCustomTo: string;
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
    case "updatedAt":
      return { id, field: "updatedAt", op: "IS", createdFrom: "", createdTo: "" };
    case "customField":
      return {
        id,
        field: "customField",
        op: "IS",
        key: "",
        value: "",
        datePreset: "all",
        dateCustomFrom: "",
        dateCustomTo: "",
      };
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
      datePreset: "all",
      dateCustomFrom: "",
      dateCustomTo: "",
    });
  }
  return rows;
}

function savedRowToDashRow(
  id: string,
  r: WidgetFilterRowSaved,
  dealCustomFields: DealCustomFieldDef[],
): DashFilterRow {
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
    case "updatedAt":
      return {
        id,
        field: "updatedAt",
        op: "IS",
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
      };
    case "customField": {
      const key = r.customKey ?? "";
      const base = {
        id,
        field: "customField" as const,
        op: "IS" as const,
        key,
        value: "",
        datePreset: "all" as DashCustomDatePreset,
        dateCustomFrom: "",
        dateCustomTo: "",
      };
      if (!key) return base;

      if (isWidgetFilterRollingDatePreset(r.customDatePreset)) {
        return {
          ...base,
          datePreset: r.customDatePreset,
        };
      }

      if (r.customDateFrom?.trim() || r.customDateTo?.trim()) {
        return {
          ...base,
          datePreset: "custom",
          dateCustomFrom: r.customDateFrom ?? "",
          dateCustomTo: r.customDateTo ?? "",
        };
      }

      const cf = dealCustomFields.find((c) => c.key === key);
      if (cf?.fieldType === "DATE") {
        if (
          r.customValue !== undefined &&
          r.customValue !== null &&
          r.customValue !== ""
        ) {
          return {
            ...base,
            datePreset: "exact",
            value: String(r.customValue),
          };
        }
        return base;
      }
      return {
        ...base,
        value:
          r.customValue === undefined || r.customValue === null
            ? ""
            : String(r.customValue),
      };
    }
  }
}

function dashRowToSaved(
  row: DashFilterRow,
  dealCustomFields: DealCustomFieldDef[],
): WidgetFilterRowSaved {
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
    case "updatedAt":
      return {
        rowJoin,
        field: "updatedAt",
        op: "IS",
        createdFrom: row.createdFrom || undefined,
        createdTo: row.createdTo || undefined,
      };
    case "customField": {
      const key = row.key?.trim();
      if (!key) {
        return { rowJoin, field: "customField", op: "IS" };
      }
      const cf = dealCustomFields.find((c) => c.key === key);
      if (cf?.fieldType === "DATE") {
        if (row.datePreset === "exact") {
          const parsed = parseCustomFieldFilterValueForApi(
            key,
            row.value,
            dealCustomFields,
          );
          return {
            rowJoin,
            field: "customField",
            op: "IS",
            customKey: key,
            ...(parsed !== undefined ? { customValue: parsed } : {}),
          };
        }
        if (row.datePreset === "custom") {
          const a = parseDateInputString(row.dateCustomFrom);
          const b = parseDateInputString(row.dateCustomTo);
          if (!a || !b || a.getTime() > b.getTime()) {
            return { rowJoin, field: "customField", op: "IS", customKey: key };
          }
          return {
            rowJoin,
            field: "customField",
            op: "IS",
            customKey: key,
            customDateFrom: toIsoDateLocal(a),
            customDateTo: toIsoDateLocal(b),
          };
        }
        if (isWidgetFilterRollingDatePreset(row.datePreset)) {
          return {
            rowJoin,
            field: "customField",
            op: "IS",
            customKey: key,
            customDatePreset: row.datePreset,
          };
        }
        return { rowJoin, field: "customField", op: "IS", customKey: key };
      }
      const parsed = parseCustomFieldFilterValueForApi(
        key,
        row.value,
        dealCustomFields,
      );
      return {
        rowJoin,
        field: "customField",
        op: "IS",
        customKey: key,
        ...(parsed !== undefined ? { customValue: parsed } : {}),
      };
    }
  }
}

function specToFilterGroups(
  spec: WidgetQuerySpec,
  dealCustomFields: DealCustomFieldDef[],
): DashFilterGroupState[] {
  if (spec.filterGroups && spec.filterGroups.length > 0) {
    return spec.filterGroups.map((g, gi) => ({
      id: newRowId(),
      groupJoin: gi === 0 ? undefined : g.groupJoin ?? "OR",
      rows: g.rows.map((r, ri) => {
        const id = newRowId();
        const dr = savedRowToDashRow(id, r, dealCustomFields);
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
  if (!taken.has("updatedAt")) return "updatedAt";
  return "customField";
}

function iconForDealCustomFieldType(ft: string): LucideIcon {
  switch (ft) {
    case "DATE":
      return Calendar;
    case "USER":
      return User;
    case "NUMBER":
    case "MONEY_BRL":
      return Hash;
    case "SELECT":
      return ListOrdered;
    case "EMAIL":
      return Mail;
    case "URL":
      return Link2;
    case "PHONE":
      return Phone;
    default:
      return Type;
  }
}

const DASH_BUILTIN_COLUMN_OPTIONS: {
  id: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "builtin:status", label: DASH_BUILTIN_LABELS.status, Icon: CircleDot },
  { id: "builtin:tags", label: DASH_BUILTIN_LABELS.tags, Icon: Tag },
  {
    id: "builtin:createdAt",
    label: DASH_BUILTIN_LABELS.createdAt,
    Icon: Calendar,
  },
  {
    id: "builtin:updatedAt",
    label: DASH_BUILTIN_LABELS.updatedAt,
    Icon: History,
  },
];

function dashColumnIdFromRow(row: DashFilterRow): string {
  if (row.field === "customField") {
    return row.key ? `custom:${row.key}` : "";
  }
  return `builtin:${row.field}`;
}

function labelForDashColumnId(
  columnId: string,
  dealCustomFields: DealCustomFieldDef[],
): string {
  if (!columnId) return "Selecionar campo…";
  if (columnId.startsWith("builtin:")) {
    const k = columnId.slice(8) as Exclude<DashFilterField, "customField">;
    return DASH_BUILTIN_LABELS[k];
  }
  const ck = columnId.slice(7);
  return dealCustomFields.find((c) => c.key === ck)?.name ?? ck;
}

function columnOptionSelectable(
  columnId: string,
  rows: DashFilterRow[],
  selfRowId: string,
): boolean {
  if (columnId.startsWith("custom:")) return true;
  const taken = fieldsTakenByOthers(rows, selfRowId);
  const cur = rows.find((r) => r.id === selfRowId);
  const currentId = cur ? dashColumnIdFromRow(cur) : "";
  if (columnId === currentId) return true;
  const bf = columnId.slice(8) as Exclude<DashFilterField, "customField">;
  return !taken.has(bf);
}

const dashComboTriggerClass =
  "h-10 min-w-[12rem] max-w-[16rem] justify-between rounded-md border border-input bg-background px-2 text-left text-sm font-normal shadow-sm ring-offset-background";

function DashFilterFieldPicker({
  columnId,
  groupRows,
  rowId,
  dealCustomFields,
  onSelect,
}: {
  columnId: string;
  groupRows: DashFilterRow[];
  rowId: string;
  dealCustomFields: DealCustomFieldDef[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const flat = useMemo(() => {
    const customs = [...dealCustomFields]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((f) => ({
        id: `custom:${f.key}`,
        label: f.name,
        Icon: iconForDealCustomFieldType(f.fieldType),
        search: `${f.name} ${f.key}`.toLowerCase(),
      }));
    const builtins = DASH_BUILTIN_COLUMN_OPTIONS.map((b) => ({
      ...b,
      search: b.label.toLowerCase(),
    }));
    return [...builtins, ...customs];
  }, [dealCustomFields]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return flat;
    return flat.filter((x) => x.search.includes(t));
  }, [flat, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={dashComboTriggerClass}
        >
          <span className="min-w-0 flex-1 truncate">
            {labelForDashColumnId(columnId, dealCustomFields)}
          </span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] border-border/60 p-0 shadow-lg"
        align="start"
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar…"
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {filtered.map((opt) => {
            const ok = columnOptionSelectable(opt.id, groupRows, rowId);
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!ok}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40",
                  columnId === opt.id && "bg-muted/60",
                )}
                onClick={() => {
                  if (!ok) return;
                  onSelect(opt.id);
                  setOpen(false);
                  setQ("");
                }}
              >
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BarXAxisFieldPicker({
  columnId,
  dealCustomFields,
  onSelect,
}: {
  columnId: string;
  dealCustomFields: DealCustomFieldDef[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const flat = useMemo(() => {
    const builtins: {
      id: string;
      label: string;
      Icon: LucideIcon;
      search: string;
    }[] = [
      {
        id: BAR_X_STAGE,
        label: "Estágio",
        Icon: Kanban,
        search: "estágio pipeline fase coluna",
      },
      {
        id: BAR_X_STATUS,
        label: "Status",
        Icon: CircleDot,
        search: "status aberto ganho perdido",
      },
      {
        id: BAR_X_ASSIGNEE,
        label: "Responsável",
        Icon: User,
        search: "responsável atribuído dono vendedor",
      },
      {
        id: BAR_X_TIMELINE_CREATED,
        label: "Data de criação",
        Icon: Calendar,
        search: "criação criado data criação do deal",
      },
    ];
    const customs = [...dealCustomFields]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((f) =>
        f.fieldType === "DATE"
          ? {
              id: barXTimelineDateKey(f.key),
              label: f.name,
              Icon: iconForDealCustomFieldType(f.fieldType),
              search: `${f.name} ${f.key} data linha do tempo`.toLowerCase(),
            }
          : {
              id: barXCustomKey(f.key),
              label: f.name,
              Icon: iconForDealCustomFieldType(f.fieldType),
              search: `${f.name} ${f.key}`.toLowerCase(),
            },
      );
    return [...builtins, ...customs];
  }, [dealCustomFields]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return flat;
    return flat.filter((x) => x.search.includes(t));
  }, [flat, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={dashComboTriggerClass}
        >
          <span className="min-w-0 flex-1 truncate">
            {labelForBarXColumnId(columnId, dealCustomFields)}
          </span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] border-border/60 p-0 shadow-lg"
        align="start"
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar…"
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {filtered.map((opt) => {
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                  columnId === opt.id && "bg-muted/60",
                )}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                  setQ("");
                }}
              >
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function barYMeasureButtonLabel(
  dataMeasure: DataMeasure,
  customFieldKey: string,
  dealCustomFields: DealCustomFieldDef[],
): string {
  if (dataMeasure === "QUANTITY") return "Número de deals";
  if (dataMeasure === "MONEY") return "Valor do negócio (R$)";
  if (dataMeasure === "AVG_CYCLE_DAYS") return "Ciclo médio (dias)";
  const cf = dealCustomFields.find((c) => c.key === customFieldKey);
  return cf?.name ?? "Campo numérico…";
}

function BarYMeasurePicker({
  dataMeasure,
  customFieldKey,
  numericCustomFields,
  dealCustomFields,
  onPick,
}: {
  dataMeasure: DataMeasure;
  customFieldKey: string;
  numericCustomFields: DealCustomFieldDef[];
  dealCustomFields: DealCustomFieldDef[];
  onPick: (next: {
    dataMeasure: DataMeasure;
    customFieldKey: string;
    aggregation: Aggregation;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = barYMeasureButtonLabel(
    dataMeasure,
    customFieldKey,
    dealCustomFields,
  );
  const flat = useMemo(() => {
    const head: {
      id: string;
      label: string;
      Icon: LucideIcon;
      search: string;
      payload: { dataMeasure: DataMeasure; customFieldKey: string; aggregation: Aggregation };
    }[] = [
      {
        id: "qty",
        label: "Número de deals",
        Icon: CircleDot,
        search: "número quantidade deals negócios",
        payload: {
          dataMeasure: "QUANTITY",
          customFieldKey: "",
          aggregation: "SUM",
        },
      },
      {
        id: "money",
        label: "Valor do negócio (R$)",
        Icon: DollarSign,
        search: "dinheiro valor real pipeline",
        payload: {
          dataMeasure: "MONEY",
          customFieldKey: "",
          aggregation: "SUM",
        },
      },
    ];
    const nums = numericCustomFields.map((f) => ({
      id: `cf:${f.key}`,
      label: f.name,
      Icon: iconForDealCustomFieldType(f.fieldType),
      search: `${f.name} ${f.key} número`.toLowerCase(),
      payload: {
        dataMeasure: "CUSTOM_NUMBER" as const,
        customFieldKey: f.key,
        aggregation: "SUM" as Aggregation,
      },
    }));
    return [...head, ...nums];
  }, [numericCustomFields]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return flat;
    return flat.filter((x) => x.search.includes(t));
  }, [flat, q]);
  const currentId =
    dataMeasure === "QUANTITY"
      ? "qty"
      : dataMeasure === "MONEY"
        ? "money"
        : `cf:${customFieldKey}`;
  const headOpts = filtered.filter((x) => x.id === "qty" || x.id === "money");
  const numOpts = filtered.filter((x) => x.id.startsWith("cf:"));
  const noResults = headOpts.length === 0 && numOpts.length === 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={dashComboTriggerClass}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] border-border/60 p-0 shadow-lg"
        align="start"
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar…"
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {noResults ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          ) : (
            <>
              {headOpts.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Deals e valor
                  </p>
                  {headOpts.map((opt) => {
                    const Icon = opt.Icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                          currentId === opt.id && "bg-muted/60",
                        )}
                        onClick={() => {
                          onPick(opt.payload);
                          setOpen(false);
                          setQ("");
                        }}
                      >
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : null}
              {numericCustomFields.length > 0 && numOpts.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Campos numéricos
                  </p>
                  {numOpts.map((opt) => {
                    const Icon = opt.Icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                          currentId === opt.id && "bg-muted/60",
                        )}
                        onClick={() => {
                          onPick(opt.payload);
                          setOpen(false);
                          setQ("");
                        }}
                      >
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Estilos alinhados ao tema (light/dark via tokens do app). */
const panel = {
  shell:
    "w-[min(42rem,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-2xl sm:max-w-3xl",
  control:
    "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40",
  divider: "border-border",
  muted: "text-xs text-muted-foreground",
} as const;

export function DashboardWidgetConfigDialog({
  open,
  onOpenChange,
  widget,
  pipelines,
  tags,
  dealCustomFields,
  tenantMembers = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  widget: LayoutWidget | null;
  pipelines: PipelineListItem[];
  tags: TagListItem[];
  dealCustomFields: DealCustomFieldDef[];
  tenantMembers?: TenantMemberOption[];
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
  const [barShowAverage, setBarShowAverage] = useState(true);
  const [barShowLegend, setBarShowLegend] = useState(false);
  const [barSeriesDisplay, setBarSeriesDisplay] =
    useState<BarSeriesDisplay>("BAR");
  const [barTimePreset, setBarTimePreset] = useState<BarTimePreset>("LAST_30_DAYS");
  /** Com este/próximo mês: eixo com todos os dias do mês (futuros = 0) vs só até hoje. */
  const [barFillFullMonth, setBarFillFullMonth] = useState(false);
  const [barCustomDays, setBarCustomDays] = useState(30);
  const [barXGroupBy, setBarXGroupBy] = useState<BarXGroupBy>("DAY");
  /** BY_DAY sem campo Data custom: bucket por criação ou por atualização. */
  const [byDayAnchor, setByDayAnchor] = useState<"CREATED_AT" | "UPDATED_AT">(
    "CREATED_AT",
  );
  /** BY_GOAL_PROGRESS: meta em R$. */
  const [gaugeTargetMoney, setGaugeTargetMoney] = useState(100_000);
  const [donutGaugeShape, setDonutGaugeShape] = useState(false);
  const [timelineBucketFieldKey, setTimelineBucketFieldKey] = useState("");
  /** Eixo X do gráfico em barras (estágio, status, responsável, timeline, campo). */
  const [barXColumnId, setBarXColumnId] = useState(BAR_X_STAGE);
  const [filterGroups, setFilterGroups] = useState<DashFilterGroupState[]>(() => [
    defaultFilterGroup(),
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
    setTimelineBucketFieldKey(s.timelineBucketFieldKey ?? "");
    setFilterGroups(specToFilterGroups(s, dealCustomFields));
    setByDayAnchor(s.byDayAnchor === "UPDATED_AT" ? "UPDATED_AT" : "CREATED_AT");
    if (widget.type === "BAR") {
      const bc = { ...defaultBarChartConfig(), ...widget.barChart };
      setBarShowAverage(bc.showAverageLine ?? true);
      setBarShowLegend(bc.showLegend ?? false);
      setBarTimePreset(bc.timePreset ?? inferBarTimePreset(s));
      setBarFillFullMonth(s.fillTimelineMonth === true);
      setBarXGroupBy(bc.xGroupBy ?? "DAY");
      setBarCustomDays(s.days ?? 30);
      setBarXColumnId(inferBarXColumnIdFromSpec(s, dealCustomFields));
      setBarSeriesDisplay(bc.seriesDisplay === "LINE" ? "LINE" : "BAR");
    }
    setGaugeTargetMoney(
      typeof s.gaugeTargetMoney === "number" && Number.isFinite(s.gaugeTargetMoney)
        ? s.gaugeTargetMoney
        : 100_000,
    );
    setDonutGaugeShape(widget.donutChart?.variant === "semicircle");
  }, [widget, open, dealCustomFields]);

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

  function onBarXColumnSelect(id: string) {
    setBarXColumnId(id);
    const p = parseBarXColumnId(id);
    setDimension(p.dimension);
    if (p.dimension === "BY_DAY") {
      setTimelineBucketFieldKey(p.timelineBucketFieldKey ?? "");
    } else {
      setTimelineBucketFieldKey("");
    }
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

  function onDashUnifiedColumnSelect(
    groupId: string,
    rowId: string,
    columnId: string,
  ) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          rows: g.rows.map((r) => {
            if (r.id !== rowId) return r;
            const rowJoin = r.rowJoin;
            if (columnId.startsWith("builtin:")) {
              const bf = columnId.slice(8) as DashFilterField;
              if (bf === "customField") return r;
              const next = createDashFilterRowWithId(rowId, bf);
              return rowJoin ? { ...next, rowJoin } : next;
            }
            if (columnId.startsWith("custom:")) {
              const key = columnId.slice(7);
              const next: DashFilterRow = {
                id: rowId,
                field: "customField",
                op: "IS",
                key,
                value: "",
                datePreset: "all",
                dateCustomFrom: "",
                dateCustomTo: "",
              };
              return rowJoin ? { ...next, rowJoin } : next;
            }
            return r;
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
          const s = dashRowToSaved(r, dealCustomFields);
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
      aggregation:
        dataMeasure === "QUANTITY" || dataMeasure === "AVG_CYCLE_DAYS"
          ? "SUM"
          : aggregation,
      customFieldKey:
        dataMeasure === "CUSTOM_NUMBER" ? customFieldKey || undefined : undefined,
      filterGroups: filterGroupsPayload,
    };

    if (isMetric) {
      spec.dimension = null;
      delete spec.timelineStart;
      delete spec.fillTimelineMonth;
      delete spec.timelineBucketFieldKey;
      delete spec.days;
      delete spec.gaugeTargetMoney;
      delete spec.byDayAnchor;
    } else if (isBar) {
      const x = parseBarXColumnId(barXColumnId);
      spec.dimension = x.dimension;
      delete spec.groupByCustomFieldKey;
      delete spec.timelineBucketFieldKey;
      delete spec.timelineStart;
      delete spec.fillTimelineMonth;
      delete spec.days;

      delete spec.byDayAnchor;
      if (x.dimension === "BY_CUSTOM_VALUE" && x.groupByCustomFieldKey) {
        spec.groupByCustomFieldKey = x.groupByCustomFieldKey;
      }

      if (x.dimension === "BY_DAY") {
        const tb = x.timelineBucketFieldKey?.trim();
        if (tb) spec.timelineBucketFieldKey = tb;
        if (!tb && byDayAnchor === "UPDATED_AT") {
          spec.byDayAnchor = "UPDATED_AT";
        }
        if (barTimePreset === "THIS_MONTH") {
          spec.timelineStart = firstDayOfMonthIsoLocal();
          spec.fillTimelineMonth = barFillFullMonth;
        } else if (barTimePreset === "NEXT_MONTH") {
          spec.timelineStart = firstDayOfNextMonthIsoLocal();
          spec.fillTimelineMonth = barFillFullMonth;
        } else if (barTimePreset === "LAST_7_DAYS") {
          spec.days = 7;
        } else if (barTimePreset === "LAST_30_DAYS") {
          spec.days = 30;
        } else if (barTimePreset === "LAST_90_DAYS") {
          spec.days = 90;
        } else {
          spec.days = Math.min(366, Math.max(1, barCustomDays));
        }
      }
    } else {
      spec.dimension = (dimension || "BY_STAGE") as NonNullable<
        WidgetQuerySpec["dimension"]
      >;
      delete spec.timelineStart;
      delete spec.fillTimelineMonth;
      delete spec.timelineBucketFieldKey;
      delete spec.byDayAnchor;
      delete spec.gaugeTargetMoney;
      delete spec.days;
      if (spec.dimension === "BY_GOAL_PROGRESS") {
        spec.gaugeTargetMoney = Math.max(1, Math.floor(gaugeTargetMoney));
        spec.dataMeasure = "MONEY";
        spec.aggregation = "SUM";
      } else if (spec.dimension === "BY_DAY") {
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
        showLegend: barShowLegend,
        timePreset: barTimePreset,
        xGroupBy: spec.dimension === "BY_DAY" ? barXGroupBy : "DAY",
        seriesDisplay: barSeriesDisplay,
      };
    } else if (widget.type === "DONUT" || widget.type === "PIE") {
      if (donutGaugeShape) {
        next.donutChart = { variant: "semicircle" };
      } else {
        next.donutChart = undefined;
      }
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4">
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
                  <div className={`grid gap-1 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Tela</p>
                    <BarConfigToggle
                      id="dw-bar-avg"
                      label="Mostrar linha média"
                      checked={barShowAverage}
                      onCheckedChange={setBarShowAverage}
                    />
                    <BarConfigToggle
                      id="dw-bar-legend"
                      label="Mostrar legenda"
                      checked={barShowLegend}
                      onCheckedChange={setBarShowLegend}
                    />
                    <BarConfigToggle
                      id="dw-bar-line-view"
                      label="Ver como linha"
                      checked={barSeriesDisplay === "LINE"}
                      onCheckedChange={(v) =>
                        setBarSeriesDisplay(v ? "LINE" : "BAR")
                      }
                    />
                    <p className={cn(panel.muted, "-mt-1 text-[11px] leading-snug")}>
                      Mesmos dados e eixos; só muda o desenho (barras ou linha).
                    </p>
                  </div>
                  <div className={`grid gap-3 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Eixo X</p>
                    <div className="grid gap-1.5">
                      <Label className="text-foreground">O que cada barra representa</Label>
                      <BarXAxisFieldPicker
                        columnId={barXColumnId}
                        dealCustomFields={dealCustomFields}
                        onSelect={onBarXColumnSelect}
                      />
                      <p className={cn(panel.muted, "text-[11px] leading-snug")}>
                        Mesmo estilo da lista de campos dos filtros do cartão:
                        estágio, status, responsável, data de criação ou qualquer
                        campo do negócio (datas viram linha do tempo).
                      </p>
                    </div>
                    {parseBarXColumnId(barXColumnId).dimension === "BY_DAY" ? (
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
                        {parseBarXColumnId(barXColumnId).dimension === "BY_DAY" &&
                        !parseBarXColumnId(barXColumnId).timelineBucketFieldKey ? (
                          <div className="grid gap-1.5">
                            <Label
                              htmlFor="dw-bar-day-anchor"
                              className="text-foreground"
                            >
                              Data no eixo (por dia)
                            </Label>
                            <select
                              id="dw-bar-day-anchor"
                              className={panel.control}
                              value={byDayAnchor}
                              onChange={(e) =>
                                setByDayAnchor(
                                  e.target.value as "CREATED_AT" | "UPDATED_AT",
                                )
                              }
                            >
                              <option value="CREATED_AT">
                                Criação do deal
                              </option>
                              <option value="UPDATED_AT">
                                Atualização (fechamento aprox.)
                              </option>
                            </select>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className={`grid gap-3 border-t pt-5 ${panel.divider}`}>
                    <p className="text-sm font-medium text-foreground">Eixo Y</p>
                    <div className="grid gap-1.5">
                      <Label className="text-foreground">Medida</Label>
                      <BarYMeasurePicker
                        dataMeasure={dataMeasure}
                        customFieldKey={customFieldKey}
                        numericCustomFields={numericCustomFields}
                        dealCustomFields={dealCustomFields}
                        onPick={(next) => {
                          setDataMeasure(next.dataMeasure);
                          setCustomFieldKey(next.customFieldKey);
                          setAggregation(next.aggregation);
                        }}
                      />
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
                    {dataMeasure === "CUSTOM_NUMBER" && !customFieldKey ? (
                      <p className={panel.muted}>
                        Escolha um campo numérico na medida acima.
                      </p>
                    ) : null}
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
                      disabled={
                        !isMetric &&
                        (dimension || "BY_STAGE") === "BY_GOAL_PROGRESS"
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
                      {isMetric ? (
                        <option
                          value="AVG_CYCLE_DAYS"
                          className="bg-popover text-popover-foreground"
                        >
                          Ciclo médio (dias)
                        </option>
                      ) : null}
                    </select>
                  </div>
                  {dataMeasure !== "QUANTITY" && dataMeasure !== "AVG_CYCLE_DAYS" ? (
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
                          onChange={(e) => {
                            const v = e.target.value as NonNullable<
                              WidgetQuerySpec["dimension"]
                            >;
                            setDimension(v);
                            if (v === "BY_GOAL_PROGRESS") {
                              setDataMeasure("MONEY");
                              setAggregation("SUM");
                            }
                          }}
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
                      {(dimension || "BY_STAGE") === "BY_GOAL_PROGRESS" ? (
                        <div className="grid gap-1.5">
                          <Label
                            htmlFor="dw-gauge-target"
                            className="text-foreground"
                          >
                            Meta (R$)
                          </Label>
                          <Input
                            id="dw-gauge-target"
                            type="number"
                            min={1}
                            step={1000}
                            value={gaugeTargetMoney}
                            onChange={(e) =>
                              setGaugeTargetMoney(
                                Math.max(1, Number(e.target.value) || 1),
                              )
                            }
                            className={panel.control}
                          />
                          <p className={panel.muted}>
                            Compara a soma do valor dos deals filtrados com esta
                            meta.
                          </p>
                        </div>
                      ) : null}
                      {widget.type === "DONUT" ? (
                        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                          <BarConfigToggle
                            id="dw-donut-semicircle"
                            label="Gauge (meia rosca)"
                            checked={donutGaugeShape}
                            onCheckedChange={setDonutGaugeShape}
                          />
                        </div>
                      ) : null}
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
              <div className={`grid gap-4 border-t pt-5 ${panel.divider}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Filtros do cartão
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
                      <DashFilterFieldPicker
                        columnId={dashColumnIdFromRow(row)}
                        groupRows={group.rows}
                        rowId={row.id}
                        dealCustomFields={dealCustomFields}
                        onSelect={(id) =>
                          onDashUnifiedColumnSelect(group.id, row.id, id)
                        }
                      />
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
                      {(row.field === "createdAt" || row.field === "updatedAt") ? (
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
                                        (r.field === "createdAt" ||
                                          r.field === "updatedAt")
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
                                        (r.field === "createdAt" ||
                                          r.field === "updatedAt")
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
                        <DashCustomFieldFilterControls
                          rowKey={row.key}
                          rowValue={row.value}
                          datePreset={row.datePreset}
                          dateCustomFrom={row.dateCustomFrom}
                          dateCustomTo={row.dateCustomTo}
                          dealCustomFields={dealCustomFields}
                          tenantMembers={tenantMembers}
                          selectClass={selectClass}
                          mutedClass={panel.muted}
                          onPatch={(patch) =>
                            setFilterGroups((prev) =>
                              prev.map((g) => {
                                if (g.id !== group.id) return g;
                                return {
                                  ...g,
                                  rows: g.rows.map((r) =>
                                    r.id === row.id &&
                                    r.field === "customField"
                                      ? { ...r, ...patch }
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
              </div>
            </div>
          </div>
        </div>
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
