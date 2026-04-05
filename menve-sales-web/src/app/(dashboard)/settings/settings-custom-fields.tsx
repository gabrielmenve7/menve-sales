"use client";

import type { CustomField } from "@prisma/client";
import type { CustomFieldEntityLiteral } from "@/lib/custom-field-entity";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createCustomField,
  deleteCustomField,
  reorderCustomFields,
  updateCustomField,
} from "@/actions/custom-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPES = ["TEXT", "NUMBER", "DATE", "SELECT"] as const;

export function SettingsCustomFields({
  fields: initial,
  entity,
  title,
  description,
  listLabel,
  newFieldTitle,
  idPrefix,
}: {
  fields: CustomField[];
  entity: CustomFieldEntityLiteral;
  title: string;
  description: string;
  listLabel: string;
  newFieldTitle: string;
  idPrefix: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFields(initial);
  }, [initial]);

  async function persistOrder(next: CustomField[]) {
    setFields(next);
    setBusy(true);
    setError(null);
    try {
      await reorderCustomFields({
        orderedIds: next.map((f) => f.id),
        entity,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reordenar");
      setFields(initial);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const list = [...fields];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    void persistOrder(list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <NewFieldForm
          entity={entity}
          formTitle={newFieldTitle}
          idPrefix={idPrefix}
          busy={busy}
          onError={setError}
          onBusy={setBusy}
          onDone={() => router.refresh()}
        />

        <div>
          <p className="mb-2 text-sm font-medium">
            {listLabel} ({fields.length})
          </p>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum campo. Adicione acima.
            </p>
          ) : (
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  disabled={busy}
                  canUp={i > 0}
                  canDown={i < fields.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onSaved={() => router.refresh()}
                  onDeleted={() => router.refresh()}
                  onError={setError}
                  setBusy={setBusy}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewFieldForm({
  entity,
  formTitle,
  idPrefix,
  busy,
  onError,
  onBusy,
  onDone,
}: {
  entity: CustomFieldEntityLiteral;
  formTitle: string;
  idPrefix: string;
  busy: boolean;
  onError: (s: string | null) => void;
  onBusy: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [fieldType, setFieldType] = useState<(typeof TYPES)[number]>("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onBusy(true);
    onError(null);
    try {
      const options =
        fieldType === "SELECT"
          ? optionsText
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      await createCustomField({
        name: name.trim(),
        key: key.trim(),
        fieldType,
        options,
        entity,
        required,
      });
      setName("");
      setKey("");
      setFieldType("TEXT");
      setOptionsText("");
      setRequired(false);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      onBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-3 rounded-lg border p-3"
    >
      <p className="text-sm font-medium">{formTitle}</p>
      <div className="flex flex-wrap gap-3">
        <div className="grid min-w-[140px] gap-1">
          <Label htmlFor={`${idPrefix}-cf-name`}>Nome</Label>
          <Input
            id={`${idPrefix}-cf-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid min-w-[120px] gap-1">
          <Label htmlFor={`${idPrefix}-cf-key`}>Chave (slug)</Label>
          <Input
            id={`${idPrefix}-cf-key`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ex: linkedin"
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-cf-type`}>Tipo</Label>
          <select
            id={`${idPrefix}-cf-type`}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={fieldType}
            onChange={(e) =>
              setFieldType(e.target.value as (typeof TYPES)[number])
            }
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Obrigatório
        </label>
      </div>
      {fieldType === "SELECT" ? (
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-cf-opt`}>
            Opções (uma por linha ou separadas por vírgula)
          </Label>
          <textarea
            id={`${idPrefix}-cf-opt`}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            className="min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>
      ) : null}
      <Button type="submit" disabled={busy || !name.trim() || !key.trim()}>
        Adicionar campo
      </Button>
    </form>
  );
}

function FieldRow({
  field,
  disabled,
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
  onSaved,
  onDeleted,
  onError,
  setBusy,
}: {
  field: CustomField;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (s: string | null) => void;
  setBusy: (v: boolean) => void;
}) {
  const [name, setName] = useState(field.name);
  const [fieldType, setFieldType] = useState(field.fieldType);
  const [optionsText, setOptionsText] = useState(
    field.fieldType === "SELECT" && Array.isArray(field.options)
      ? (field.options as string[]).join("\n")
      : "",
  );
  const [required, setRequired] = useState(field.required);

  useEffect(() => {
    setName(field.name);
    setFieldType(field.fieldType);
    setOptionsText(
      field.fieldType === "SELECT" && Array.isArray(field.options)
        ? (field.options as string[]).join("\n")
        : "",
    );
    setRequired(field.required);
  }, [field]);

  async function onSave() {
    setBusy(true);
    onError(null);
    try {
      const options =
        fieldType === "SELECT"
          ? optionsText
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      await updateCustomField({
        id: field.id,
        name: name.trim(),
        fieldType: fieldType as (typeof TYPES)[number],
        options: fieldType === "SELECT" ? options : undefined,
        required,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Excluir o campo "${field.name}"?`)) return;
    setBusy(true);
    onError(null);
    try {
      await deleteCustomField(field.id);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[140px] flex-1 gap-1">
          <Label className="text-xs">Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Tipo</Label>
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            disabled={disabled}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={disabled}
          />
          Obrigatório
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canUp}
          onClick={onMoveUp}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canDown}
          onClick={onMoveDown}
        >
          ↓
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={() => void onSave()}>
          Salvar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={disabled}
          onClick={() => void onDelete()}
        >
          Excluir
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Chave: <code>{field.key}</code>
      </p>
      {fieldType === "SELECT" ? (
        <div className="grid gap-1">
          <Label className="text-xs">Opções</Label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            disabled={disabled}
            className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
          />
        </div>
      ) : null}
    </li>
  );
}
