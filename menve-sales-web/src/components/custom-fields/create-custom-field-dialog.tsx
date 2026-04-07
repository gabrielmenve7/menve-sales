"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Calendar,
  ChevronDown,
  DollarSign,
  Globe,
  Hash,
  ListOrdered,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  Type,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createCustomField } from "@/actions/custom-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CUSTOM_FIELD_ENTITY,
  type CustomFieldEntityLiteral,
} from "@/lib/custom-field-entity";
import { slugifyCustomFieldKey } from "@/lib/custom-field-key";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldTypeCode,
} from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";

const zForm = "z-[110]";

/** Ordem semelhante ao catálogo ClickUp (lista → texto → …). */
const PICKER_FIELD_ORDER: CustomFieldTypeCode[] = [
  "SELECT",
  "TEXT",
  "DATE",
  "NUMBER",
  "MONEY_BRL",
  "URL",
  "PHONE",
  "EMAIL",
  "USER",
];

function TypePickerIcon({ type }: { type: CustomFieldTypeCode }) {
  const iconCls = "size-[18px] shrink-0";
  const stroke = 2;
  switch (type) {
    case "SELECT":
      return (
        <ListOrdered className={cn(iconCls, "text-emerald-500")} strokeWidth={stroke} />
      );
    case "TEXT":
      return <Type className={cn(iconCls, "text-sky-500")} strokeWidth={stroke} />;
    case "DATE":
      return (
        <Calendar className={cn(iconCls, "text-amber-600 dark:text-amber-500")} strokeWidth={stroke} />
      );
    case "NUMBER":
      return <Hash className={cn(iconCls, "text-emerald-600")} strokeWidth={stroke} />;
    case "MONEY_BRL":
      return (
        <DollarSign className={cn(iconCls, "text-emerald-500")} strokeWidth={stroke} />
      );
    case "URL":
      return <Globe className={cn(iconCls, "text-rose-500")} strokeWidth={stroke} />;
    case "PHONE":
      return <Phone className={cn(iconCls, "text-violet-500")} strokeWidth={stroke} />;
    case "EMAIL":
      return <Mail className={cn(iconCls, "text-blue-500")} strokeWidth={stroke} />;
    case "USER":
      return <User className={cn(iconCls, "text-indigo-500")} strokeWidth={stroke} />;
    default:
      return <Type className={cn(iconCls, "text-muted-foreground")} strokeWidth={stroke} />;
  }
}

const pickerPanel = cn(
  "w-[min(100vw-1.5rem,288px)] overflow-hidden rounded-[10px] border p-0 shadow-xl",
  "border-border bg-popover text-popover-foreground",
  "dark:border-[#333333] dark:bg-[#1e1e1e] dark:text-neutral-200",
);

const formField = cn(
  "flex min-h-10 w-full rounded-md border px-3 py-2 text-sm transition-[border-color,box-shadow]",
  "border-input bg-background text-foreground",
  "placeholder:text-muted-foreground",
  "dark:border-[#3d3d3d] dark:bg-[#2a2a2a] dark:text-neutral-100 dark:placeholder:text-neutral-500",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "dark:focus-visible:border-white/85 dark:focus-visible:ring-white/25 dark:focus-visible:ring-offset-0",
);

const formDialogSurface = cn(
  "grid max-h-[min(90vh,580px)] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-xl border p-0 shadow-xl",
  "border-border bg-background text-foreground",
  "dark:border-[#333333] dark:bg-[#1e1e1e] dark:text-neutral-200",
);

function FieldTypePicker({
  query,
  onQueryChange,
  onPick,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (t: CustomFieldTypeCode) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PICKER_FIELD_ORDER;
    return PICKER_FIELD_ORDER.filter((t) => {
      const label = CUSTOM_FIELD_TYPE_LABELS[t].toLowerCase();
      return label.includes(q) || t.toLowerCase().includes(q);
    });
  }, [query]);

  return (
    <div className={pickerPanel}>
      <div className="border-b border-border/70 p-2 dark:border-[#333333]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground dark:text-neutral-500"
            strokeWidth={2}
          />
          <input
            type="search"
            autoFocus
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className={cn(
              formField,
              "h-9 pl-9 pr-3",
              "dark:focus-visible:border-white/70",
            )}
          />
        </div>
      </div>
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground dark:text-neutral-500">
        Todos
      </p>
      <div
        className="max-h-[min(60vh,320px)] overflow-y-auto px-1 pb-2 [scrollbar-color:rgba(120,120,120,0.45)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgba(255,255,255,0.2)_transparent]"
        role="listbox"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground dark:text-neutral-500">
            Nenhum tipo encontrado.
          </p>
        ) : (
          filtered.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground",
                "hover:bg-muted/80 dark:text-neutral-100 dark:hover:bg-white/[0.06]",
              )}
              onClick={() => onPick(t)}
            >
              <TypePickerIcon type={t} />
              <span className="min-w-0 flex-1">{CUSTOM_FIELD_TYPE_LABELS[t]}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CustomFieldFormDialog({
  open,
  onOpenChange,
  fieldType,
  defaultEntity,
  idPrefix,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fieldType: CustomFieldTypeCode | null;
  defaultEntity: CustomFieldEntityLiteral;
  idPrefix: string;
  onCreated?: () => void;
}) {
  const [entity, setEntity] =
    useState<CustomFieldEntityLiteral>(defaultEntity);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectOptions, setSelectOptions] = useState<string[]>([""]);
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fieldType) return;
    setEntity(defaultEntity);
    setName("");
    setDescription("");
    setRequired(false);
    setError(null);
    setBusy(false);
    if (fieldType === "SELECT") setSelectOptions([""]);
    else setSelectOptions([]);
  }, [open, fieldType, defaultEntity]);

  const selectOptsClean = useMemo(
    () => selectOptions.map((s) => s.trim()).filter(Boolean),
    [selectOptions],
  );

  const canSubmit =
    name.trim().length > 0 &&
    (fieldType !== "SELECT" || selectOptsClean.length > 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldType || !canSubmit) return;
    setBusy(true);
    setError(null);
    const key = slugifyCustomFieldKey(name);
    try {
      await createCustomField({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        key,
        fieldType,
        entity,
        required,
        ...(fieldType === "SELECT" ? { options: selectOptsClean } : {}),
      });
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  if (!fieldType) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className={zForm} />
        <DialogPrimitive.Content
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "fixed left-[50%] top-[50%] gap-4 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            formDialogSurface,
            zForm,
          )}
        >
          <div className="max-h-[min(90vh,580px)] overflow-y-auto p-6 [scrollbar-color:rgba(120,120,120,0.45)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgba(255,255,255,0.2)_transparent]">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-lg font-semibold dark:text-neutral-100">
                Novo campo personalizado
              </DialogTitle>
              <DialogDescription className="text-sm dark:text-neutral-400">
                Disponível para todas as{" "}
                {entity === "DEAL" ? "oportunidades" : "pessoas de contato"} deste
                tenant. A chave interna é gerada automaticamente a partir do nome.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => void onSubmit(e)}
              className="mt-5 grid gap-4"
            >
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="grid gap-2">
                <span className="text-sm font-medium dark:text-neutral-200">
                  Aplicar a
                </span>
                <Tabs
                  value={entity}
                  onValueChange={(v) =>
                    setEntity(v as CustomFieldEntityLiteral)
                  }
                >
                  <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg border border-border/80 bg-muted/40 p-1 dark:border-[#3d3d3d] dark:bg-[#252525]">
                    <TabsTrigger
                      value={CUSTOM_FIELD_ENTITY.DEAL}
                      className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#2f2f2f] dark:data-[state=active]:text-white"
                    >
                      Oportunidade
                    </TabsTrigger>
                    <TabsTrigger
                      value={CUSTOM_FIELD_ENTITY.CONTACT}
                      className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#2f2f2f] dark:data-[state=active]:text-white"
                    >
                      Contato
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor={`${idPrefix}-name`}
                  className="dark:text-neutral-200"
                >
                  Nome do campo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`${idPrefix}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Insira o nome…"
                  required
                  autoComplete="off"
                  className={cn(formField, "h-10")}
                />
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor={`${idPrefix}-desc`}
                  className="text-muted-foreground dark:text-neutral-400"
                >
                  Descrição (opcional)
                </Label>
                <textarea
                  id={`${idPrefix}-desc`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ajuda exibida ao passar o mouse no campo…"
                  rows={2}
                  className={cn(formField, "min-h-[72px] resize-y")}
                />
                <p className="text-xs text-muted-foreground dark:text-neutral-500">
                  Passe o cursor sobre os campos nas tarefas para ver a descrição.
                </p>
              </div>

              <div className="grid gap-1.5">
                <span className="text-sm font-medium dark:text-neutral-200">
                  Tipo
                </span>
                <div
                  className={cn(
                    "flex h-10 items-center justify-between gap-2 rounded-md border px-3",
                    "border-input bg-muted/30 dark:border-[#3d3d3d] dark:bg-[#2a2a2a]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-sm">
                    <TypePickerIcon type={fieldType} />
                    <span className="truncate dark:text-neutral-100">
                      {CUSTOM_FIELD_TYPE_LABELS[fieldType]}
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground dark:text-neutral-500" />
                </div>
              </div>

              {fieldType === "SELECT" ? (
                <div className="grid gap-2">
                  <Label className="dark:text-neutral-200">
                    Opções da lista <span className="text-destructive">*</span>
                  </Label>
                  <div className="space-y-2">
                    {selectOptions.map((row, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={row}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSelectOptions((prev) => {
                              const next = [...prev];
                              next[i] = v;
                              return next;
                            });
                          }}
                          placeholder={`Opção ${i + 1}`}
                          className={cn(formField, "h-9 flex-1")}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 border-border dark:border-[#3d3d3d]"
                          disabled={selectOptions.length <= 1}
                          onClick={() =>
                            setSelectOptions((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          aria-label="Remover opção"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed dark:border-[#3d3d3d]"
                      onClick={() =>
                        setSelectOptions((prev) => [...prev, ""])
                      }
                    >
                      <Plus className="mr-1.5 size-4" />
                      Adicionar opção
                    </Button>
                  </div>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="rounded border-input dark:border-[#3d3d3d]"
                />
                Obrigatório
              </label>

              <DialogFooter className="gap-2 border-t border-border/60 pt-4 dark:border-[#333333] sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="dark:border-[#3d3d3d] dark:bg-transparent dark:hover:bg-white/5"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy || !canSubmit}>
                  {busy ? "Criando…" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </div>

          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none dark:text-neutral-400 dark:focus:ring-neutral-600">
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * Fluxo estilo ClickUp: primeiro popover com tipos (pesquisa), depois modal de cadastro.
 */
export function CreateCustomFieldTrigger({
  defaultEntity = CUSTOM_FIELD_ENTITY.DEAL,
  idPrefix,
  onCreated,
  className,
  children,
}: {
  defaultEntity?: CustomFieldEntityLiteral;
  idPrefix: string;
  onCreated?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [pickedType, setPickedType] = useState<CustomFieldTypeCode | null>(
    null,
  );
  const [query, setQuery] = useState("");

  function onPickType(t: CustomFieldTypeCode) {
    setPickerOpen(false);
    setQuery("");
    setPickedType(t);
    setFormOpen(true);
  }

  function onFormOpenChange(v: boolean) {
    setFormOpen(v);
    if (!v) setPickedType(null);
  }

  return (
    <>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60",
              className,
            )}
          >
            {children ?? (
              <>
                <Plus className="size-3.5" strokeWidth={2} />
                Criar campo
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="z-[105] border-0 bg-transparent p-0 shadow-none"
        >
          <FieldTypePicker
            query={query}
            onQueryChange={setQuery}
            onPick={onPickType}
          />
        </PopoverContent>
      </Popover>

      <CustomFieldFormDialog
        open={formOpen}
        onOpenChange={onFormOpenChange}
        fieldType={pickedType}
        defaultEntity={defaultEntity}
        idPrefix={idPrefix}
        onCreated={onCreated}
      />
    </>
  );
}
