"use client";

import type { CustomField } from "@prisma/client";
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";
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

/** Apenas campos de entidade CONTACT (página já filtra). */
export function SettingsCustomFields({ fields: initial }: { fields: CustomField[] }) {
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
        entity: CUSTOM_FIELD_ENTITY.CONTACT,
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
        <CardTitle>Campos customizados (contatos)</CardTitle>
        <CardDescription>
          Definições por tenant. Valores ficam em cada contato (ficha). Chave técnica
          única por tenant (slug).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <NewFieldForm
          busy={busy}
          onError={setError}
          onBusy={setBusy}
          onDone={() => router.refresh()}
        />

        <div>
          <p className="mb-2 text-sm font-medium">
            Campos de contato ({fields.length})
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
  busy,
  onError,
  onBusy,
  onDone,
}: {
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
        entity: CUSTOM_FIELD_ENTITY.CONTACT,
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
      <p className="text-sm font-medium">Novo campo (contato)</p>
      <div className="flex flex-wrap gap-3">
        <div className="grid min-w-[140px] gap-1">
          <Label htmlFor="cf-name">Nome</Label>
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid min-w-[120px] gap-1">
          <Label htmlFor="cf-key">Chave (slug)</Label>
          <Input
            id="cf-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ex: cargo"
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="cf-type">Tipo</Label>
          <select
            id="cf-type"
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
          <Label htmlFor="cf-opt">Opções (uma por linha ou separadas por vírgula)</Label>
          <textarea
            id="cf-opt"
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
