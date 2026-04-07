"use client";

import type { CustomField } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import {
  customDataToStringMap,
  parseMoneyBrlFromInput,
  storedFieldAsDraftString,
  stringToApiValue,
} from "@/lib/custom-field-value-helpers";
import { cn } from "@/lib/utils";
import { CustomFieldTypeIcon } from "./custom-fields-display-table";
import { InlineSelectFieldRow } from "./inline-select-field-popover";

function fieldDescriptionHint(f: CustomField): string | undefined {
  const raw = (f as CustomField & { description?: string | null }).description;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

/** Valor neutro em repouso; borda/pill só no hover da linha ou foco (como ClickUp). */
const valueShell =
  "min-w-0 flex-1 rounded-md border border-transparent bg-transparent transition-[border-color,box-shadow,background-color] group-hover:border-border/60 group-hover:bg-background/90 focus-within:border-border focus-within:bg-background focus-within:ring-1 focus-within:ring-ring/35";

const inputClass =
  "h-9 w-full border-0 bg-transparent px-2 py-1.5 text-right text-sm shadow-none outline-none ring-0 focus-visible:ring-0 disabled:opacity-50";

const inputClassMinimal =
  "h-9 w-full border-0 bg-transparent px-0 py-1 text-left text-sm italic text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/80 placeholder:italic focus-visible:ring-0 disabled:opacity-50";

const selectClass =
  "h-9 w-full cursor-pointer appearance-none border-0 bg-transparent bg-none px-2 py-1.5 text-right text-sm shadow-none outline-none ring-0 [-moz-appearance:none] focus-visible:ring-0 disabled:opacity-50 [&::-webkit-appearance]:none";

const selectClassMinimal =
  "h-9 w-full cursor-pointer appearance-none border-0 bg-transparent bg-none px-0 py-1 text-left text-sm shadow-none outline-none ring-0 [-moz-appearance:none] focus-visible:ring-0 disabled:opacity-50 [&::-webkit-appearance]:none";

/** Alinhado às linhas nativas do modal (ícone + valor, ~32px). */
const inputClassMinimalCompact =
  "h-8 min-h-8 w-full border-0 bg-transparent px-0 py-0 text-left text-sm leading-tight italic text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/80 placeholder:italic focus-visible:ring-0 disabled:opacity-50";

const selectClassMinimalCompact =
  "h-8 min-h-8 w-full cursor-pointer appearance-none border-0 bg-transparent bg-none px-0 py-0 text-left text-sm leading-tight shadow-none outline-none ring-0 [-moz-appearance:none] focus-visible:ring-0 disabled:opacity-50 [&::-webkit-appearance]:none";

export function CustomFieldsInlineTable({
  title,
  fields,
  customData,
  members,
  idPrefix,
  className,
  onSaveField,
  onReorderSelectOptions,
  onAppendSelectOption,
  embedded = false,
  variant = "default",
  /** Padrão compacto alinhado às linhas ícone + valor do modal do deal (todas as visualizações). */
  compactMinimalRows = true,
}: {
  /** Omitir ou deixar vazio quando o título já está no cabeçalho da seção (ex.: modal do pipeline). */
  title?: string;
  /** Dentro de um cartão com faixa superior (CONTATO / OPORTUNIDADE): sem borda externa duplicada. */
  embedded?: boolean;
  /** `board`: modal largo estilo ClickUp — linhas mais altas e área de valor mais ampla. `minimal`: lista sem tabela, ícone + valor (referência CRM). */
  variant?: "default" | "board" | "minimal";
  /** `false` restaura linhas mais altas (ex.: layout estilo board). Só afeta `variant="minimal"`. */
  compactMinimalRows?: boolean;
  fields: CustomField[];
  customData: unknown;
  members: TenantMemberOption[];
  idPrefix: string;
  className?: string;
  onSaveField: (key: string, value: unknown) => Promise<void>;
  /** Reordenar opções do SELECT (ex.: `updateCustomField`); exige permissão de configurar tenant. */
  onReorderSelectOptions?: (
    fieldId: string,
    options: string[],
  ) => Promise<void>;
  /** Nova opção na definição do SELECT + uso imediato como valor. */
  onAppendSelectOption?: (fieldId: string, label: string) => Promise<void>;
}) {
  const fieldsKey = useMemo(
    () =>
      fields
        .map((f) => `${f.id}:${f.key}:${f.fieldType}:${JSON.stringify(f.options ?? null)}`)
        .join("|"),
    [fields],
  );

  const [draft, setDraft] = useState<Record<string, string>>(() =>
    customDataToStringMap(fields, customData),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(customDataToStringMap(fields, customData));
  }, [customData, fieldsKey, fields]);

  async function commitField(f: CustomField, localOverride?: string) {
    const raw = localOverride ?? draft[f.key] ?? "";
    const before = storedFieldAsDraftString(f, customData);
    if (before === raw) return;

    setErr(null);

    let payload: unknown;
    if (f.fieldType === "MONEY_BRL") {
      const t = raw.trim();
      if (t === "") {
        payload = "";
      } else {
        const n = parseMoneyBrlFromInput(raw);
        if (!Number.isFinite(n)) {
          setErr(`${f.name}: valor em reais inválido`);
          setDraft((prev) => ({
            ...prev,
            [f.key]: storedFieldAsDraftString(f, customData),
          }));
          return;
        }
        payload = n;
      }
    } else if (f.fieldType === "NUMBER") {
      const t = raw.trim();
      if (t === "") payload = "";
      else {
        const n = Number(t);
        if (!Number.isFinite(n)) {
          setErr(`${f.name}: número inválido`);
          setDraft((prev) => ({
            ...prev,
            [f.key]: storedFieldAsDraftString(f, customData),
          }));
          return;
        }
        payload = n;
      }
    } else {
      payload = stringToApiValue(f.fieldType, raw);
    }

    setSavingKey(f.key);
    try {
      await onSaveField(f.key, payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
      setDraft((prev) => ({
        ...prev,
        [f.key]: storedFieldAsDraftString(f, customData),
      }));
    } finally {
      setSavingKey(null);
    }
  }

  if (fields.length === 0) return null;

  const isMinimal = variant === "minimal";
  const isBoard = variant === "board";
  const rowPad = isMinimal
    ? compactMinimalRows
      ? "min-h-0 items-center gap-3 py-1"
      : "min-h-[44px] gap-3 py-2.5"
    : isBoard
      ? "min-h-[52px] px-4 py-2.5 sm:px-6 sm:py-3"
      : "min-h-[48px] px-3 py-1.5 sm:px-4";
  const valueCol = isMinimal
    ? "min-w-0 flex-1 max-w-none"
    : isBoard
      ? "max-w-[min(100%,22rem)] sm:max-w-[min(28rem,36vw)]"
      : "max-w-[min(100%,14rem)] sm:max-w-[16rem]";
  const ic =
    isMinimal && compactMinimalRows
      ? inputClassMinimalCompact
      : isMinimal
        ? inputClassMinimal
        : inputClass;
  const sc =
    isMinimal && compactMinimalRows
      ? selectClassMinimalCompact
      : isMinimal
        ? selectClassMinimal
        : selectClass;

  return (
    <div className={className}>
      {title?.trim() ? (
        <div className="mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
      ) : null}
      {err ? (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      <div
        className={cn(
          embedded || isMinimal
            ? "border-0 bg-transparent"
            : "overflow-hidden rounded-lg border border-border/60 bg-card/40",
        )}
      >
        {fields.map((f, idx) => {
          const val = draft[f.key] ?? "";
          const disabled = savingKey === f.key;
          const inputId = `${idPrefix}-inline-${f.id}`;

          const rowClass = cn(
            "group flex transition-colors",
            isMinimal ? "items-center rounded-lg px-0 hover:bg-muted/35" : "items-stretch gap-3 sm:gap-4 hover:bg-muted/25",
            rowPad,
            !isMinimal && (embedded || idx > 0) && "border-t border-border/50",
          );

          const labelCol = isMinimal ? (
            <label
              htmlFor={inputId}
              title={fieldDescriptionHint(f)}
              className="flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
            >
              <CustomFieldTypeIcon fieldType={f.fieldType} />
              <span className="sr-only">
                {f.name}
                {f.required ? " (obrigatório)" : ""}
              </span>
            </label>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CustomFieldTypeIcon fieldType={f.fieldType} />
              <label
                htmlFor={inputId}
                title={fieldDescriptionHint(f)}
                className="min-w-0 flex-1 text-sm text-muted-foreground"
              >
                {f.name}
                {f.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </label>
            </div>
          );

          if (f.fieldType === "SELECT") {
            return (
              <InlineSelectFieldRow
                key={f.id}
                field={f}
                value={val}
                disabled={disabled}
                required={f.required}
                inputId={inputId}
                rowClassName={rowClass}
                labelSlot={labelCol}
                valueShellClassName={cn(
                  valueShell,
                  valueCol,
                  isMinimal && "border-0 group-hover:border-transparent",
                )}
                variant={isMinimal ? "minimal" : "default"}
                compact={compactMinimalRows}
                onDefinitionError={(msg) => setErr(msg)}
                onCommitValue={async (next) => {
                  if (storedFieldAsDraftString(f, customData) === next) return;
                  setDraft((prev) => ({ ...prev, [f.key]: next }));
                  setSavingKey(f.key);
                  setErr(null);
                  try {
                    await onSaveField(f.key, next);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Erro ao salvar");
                    setDraft((prev) => ({
                      ...prev,
                      [f.key]: storedFieldAsDraftString(f, customData),
                    }));
                  } finally {
                    setSavingKey(null);
                  }
                }}
                onReorderOptions={
                  onReorderSelectOptions
                    ? async (opts) => {
                        await onReorderSelectOptions(f.id, opts);
                      }
                    : undefined
                }
                onAppendOption={
                  onAppendSelectOption
                    ? async (label) => {
                        await onAppendSelectOption(f.id, label);
                      }
                    : undefined
                }
              />
            );
          }

          return (
            <div key={f.id} className={rowClass}>
              {labelCol}

              <div
                className={cn(
                  valueShell,
                  valueCol,
                  isMinimal &&
                    "!rounded-none border-0 bg-transparent shadow-none group-hover:border-transparent group-hover:bg-transparent focus-within:border-0 focus-within:bg-transparent focus-within:shadow-none focus-within:ring-0",
                )}
              >
                {f.fieldType === "USER" ? (
                  <select
                    id={inputId}
                    className={sc}
                    disabled={disabled || members.length === 0}
                    required={f.required}
                    value={val}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (storedFieldAsDraftString(f, customData) === next) return;
                      setDraft((prev) => ({ ...prev, [f.key]: next }));
                      void (async () => {
                        setSavingKey(f.key);
                        setErr(null);
                        try {
                          await onSaveField(f.key, next);
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : "Erro ao salvar");
                          setDraft((prev) => ({
                            ...prev,
                            [f.key]: storedFieldAsDraftString(f, customData),
                          }));
                        } finally {
                          setSavingKey(null);
                        }
                      })();
                    }}
                  >
                    <option value="">
                      {f.required
                        ? "Selecione…"
                        : isMinimal
                          ? `Adicionar ${f.name.toLowerCase()}`
                          : "—"}
                    </option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name?.trim() || m.email}
                      </option>
                    ))}
                  </select>
                ) : f.fieldType === "DATE" ? (
                  <Input
                    id={inputId}
                    type="date"
                    className={cn(ic, "pr-1")}
                    disabled={disabled}
                    required={f.required}
                    value={val}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                    onBlur={(e) => void commitField(f, e.target.value)}
                  />
                ) : (
                  <Input
                    id={inputId}
                    type={
                      f.fieldType === "NUMBER"
                        ? "number"
                        : f.fieldType === "EMAIL"
                          ? "email"
                          : f.fieldType === "URL"
                            ? "url"
                            : f.fieldType === "PHONE"
                              ? "tel"
                              : "text"
                    }
                    inputMode={
                      f.fieldType === "MONEY_BRL"
                        ? "decimal"
                        : f.fieldType === "NUMBER"
                          ? "decimal"
                          : undefined
                    }
                    placeholder={
                      f.fieldType === "MONEY_BRL"
                        ? "0,00"
                        : isMinimal
                          ? `Adicionar ${f.name.toLowerCase()}`
                          : undefined
                    }
                    className={ic}
                    disabled={disabled}
                    required={f.required}
                    value={val}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                    onBlur={(e) => void commitField(f, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
