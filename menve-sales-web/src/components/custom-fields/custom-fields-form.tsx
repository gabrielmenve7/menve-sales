"use client";

import type { CustomField } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function customDataToStringMap(
  fields: CustomField[],
  customData: unknown,
): Record<string, string> {
  const base =
    customData && typeof customData === "object" && !Array.isArray(customData)
      ? (customData as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = base[f.key];
    if (v === undefined || v === null) out[f.key] = "";
    else if (typeof v === "number") out[f.key] = String(v);
    else {
      const s = String(v);
      out[f.key] =
        f.fieldType === "DATE" && s.includes("T") ? s.slice(0, 10) : s;
    }
  }
  return out;
}

type CustomFieldsFormProps = {
  fields: CustomField[];
  customData: unknown;
  /** Prefixo único para ids (ex.: `deal-abc` / `contact-xyz`) */
  idPrefix: string;
  submitLabel?: string;
  onSave: (values: Record<string, unknown>) => Promise<void>;
};

export function CustomFieldsForm({
  fields,
  customData,
  idPrefix,
  submitLabel = "Salvar campos extras",
  onSave,
}: CustomFieldsFormProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    customDataToStringMap(fields, customData),
  );

  /** Evita reset a cada render quando `fields` vem com nova referência de array (mesmo conteúdo). */
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        payload[f.key] = values[f.key] ?? "";
      }
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
        const inputType =
          f.fieldType === "NUMBER"
            ? "number"
            : f.fieldType === "DATE"
              ? "date"
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
