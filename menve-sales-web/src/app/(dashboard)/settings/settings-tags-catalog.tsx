"use client";

import type { Tag } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createCatalogTag, deleteTag, updateTag } from "@/actions/tags";
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

export function SettingsTagsCatalog({ tags: initialTags }: { tags: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("");

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createCatalogTag({
        name,
        color: newColor.trim() || undefined,
      });
      setNewName("");
      setNewColor("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>
          Catálogo do tenant. Editar ou excluir afeta todos os contatos e deals
          que usam a tag.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="new-tag-name">Nova tag</Label>
            <Input
              id="new-tag-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="min-w-[200px]"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-tag-color">Cor (hex opcional)</Label>
            <Input
              id="new-tag-color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              placeholder="#3b82f6"
              className="w-36"
            />
          </div>
          <Button type="submit" disabled={busy || !newName.trim()}>
            Adicionar
          </Button>
        </form>

        <div>
          <p className="mb-2 text-sm font-medium">Cadastradas</p>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tag ainda.</p>
          ) : (
            <ul className="space-y-2">
              {tags.map((t) => (
                <TagRow
                  key={t.id}
                  tag={t}
                  disabled={busy}
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

function TagRow({
  tag,
  disabled,
  onSaved,
  onDeleted,
  onError,
  setBusy,
}: {
  tag: Tag;
  disabled: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (msg: string | null) => void;
  setBusy: (v: boolean) => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? "");

  useEffect(() => {
    setName(tag.name);
    setColor(tag.color ?? "");
  }, [tag.id, tag.name, tag.color]);

  async function onSave() {
    setBusy(true);
    onError(null);
    try {
      await updateTag({
        id: tag.id,
        name: name.trim(),
        color: color.trim() ? color.trim() : null,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Excluir a tag "${tag.name}"?`)) return;
    setBusy(true);
    onError(null);
    try {
      await deleteTag(tag.id);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-sm">
      <div className="grid min-w-[160px] flex-1 gap-1">
        <Label className="text-xs">Nome</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="grid w-36 gap-1">
        <Label className="text-xs">Cor</Label>
        <Input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#hex"
          disabled={disabled}
        />
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => void onSave()}
        >
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
    </li>
  );
}
