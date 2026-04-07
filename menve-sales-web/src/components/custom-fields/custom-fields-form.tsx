"use client";

import type { CustomField } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import {
  customDataToStringMap,
  stringToApiValue,
} from "@/lib/custom-field-value-helpers";

function buildPayload(
  fields: CustomField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    payload[f.key] = stringToApiValue(f.fieldType, values[f.key] ?? "");
  }
  return payload;
}

type CustomFieldsFormProps = {
  fields: CustomField[];
  customData: unknown;
  /** Prefixo único para ids (ex.: `deal-abc` / `contact-xyz`) */
  idPrefix: string;
  submitLabel?: string;
  /** Obrigatório se existir campo `USER` — use `GET /settings/members` no RSC pai. */
  members?: TenantMemberOption[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
};

export function CustomFieldsForm({
  fields,
  customData,
  idPrefix,
  submitLabel = "Salvar campos extras",
  members = [],
  onSave,
}: CustomFieldsFormProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    customDataToStringMap(fields, customData),
  );

  const fieldsSyncKey = useMemo(
    () =>
      fields
        .map((f) => {
          const opt =
            f.fieldType === "SELECT"
              ? JSON.stringify(f.options ?? null)
              : "";
          return `${f.id}:${f.key}:${f.fieldType}:${f.required ? 1 : 0}:${opt}`;
        })
        .join("|"),
    [fields],
  );
  const customDataSyncKey = useMemo(
    () => JSON.stringify(customData ?? null),
    [customData],
  );

  useEffect(() => {
    setValues(customDataToStringMap(fields, customData));
  }, [fieldsSyncKey, customDataSyncKey]);

  const needsMembers = useMemo(
    () => fields.some((f) => f.fieldType === "USER"),
    [fields],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const payload = buildPayload(fields, values);
      await onSave(payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (fields.length === 0) return null;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {needsMembers && members.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Campos “Pessoa” precisam da lista de membros do tenant. Recarregue a
          página ou verifique a sessão.
        </p>
      ) : null}
      {fields.map((f) => {
        const val = values[f.key] ?? "";
        const inputId = `${idPrefix}-cf-${f.id}`;
        const label = (
          <Label htmlFor={inputId}>
            {f.name}
            {f.required ? <span className="text-destructive"> *</span> : null}
          </Label>
        );
        if (f.fieldType === "SELECT") {
          const opts = Array.isArray(f.options)
            ? (f.options as unknown[]).map(String)
            : [];
          return (
            <div key={f.id} className="grid gap-1">
              {label}
              <select
                id={inputId}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required={f.required}
                value={val}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              >
                <option value="">{f.required ? "Selecione…" : "—"}</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (f.fieldType === "USER") {
          return (
            <div key={f.id} className="grid gap-1">
              {label}
              <select
                id={inputId}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required={f.required}
                value={val}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              >
                <option value="">{f.required ? "Selecione…" : "—"}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name?.trim() || m.email}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (f.fieldType === "MONEY_BRL") {
          return (
            <div key={f.id} className="grid gap-1">
              {label}
              <Input
                id={inputId}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                required={f.required}
                value={val}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </div>
          );
        }
        const inputType =
          f.fieldType === "NUMBER"
            ? "number"
            : f.fieldType === "DATE"
              ? "date"
              : f.fieldType === "EMAIL"
                ? "email"
                : f.fieldType === "URL"
                  ? "url"
                  : f.fieldType === "PHONE"
                    ? "tel"
                    : "text";
        return (
          <div key={f.id} className="grid gap-1">
            {label}
            <Input
              id={inputId}
              type={inputType}
              required={f.required}
              value={val}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </div>
        );
      })}
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}
