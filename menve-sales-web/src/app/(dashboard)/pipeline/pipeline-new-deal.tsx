"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createContact,
  listContactsForPipeline,
} from "@/actions/contacts";
import { createDeal } from "@/actions/deals";
import { listProducts, type ProductOption } from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizedStageHex } from "@/lib/stage-pill-style";
import type { Pipeline, Stage } from "@prisma/client";
import { ProductPicker } from "./deal-products-block";

type ContactOpt = { id: string; name: string; phone: string | null };

type ProductRow = {
  /** Chave estável só para React. */
  key: string;
  productId: string | null;
  productName: string;
  quantityRaw: string;
  unitPriceRaw: string;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseDecimalBR(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma >= 0 && lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && lastComma >= 0 && lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function emptyProductRow(): ProductRow {
  return {
    key: uid(),
    productId: null,
    productName: "",
    quantityRaw: "",
    unitPriceRaw: "",
  };
}

export function PipelineNewDealDialog({
  open,
  onOpenChange,
  pipeline,
  stageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline & { stages: Stage[] };
  /** Stage inicialmente selecionado em “Status”. */
  stageId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Combos. */
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  /** Estado do form. */
  const [selectedStageId, setSelectedStageId] = useState<string>(stageId);
  const [contactName, setContactName] = useState<string>("");
  const [observation, setObservation] = useState<string>("");
  const [productRows, setProductRows] = useState<ProductRow[]>([
    emptyProductRow(),
  ]);

  /** Colapso das seções (default abertas). */
  const [generalOpen, setGeneralOpen] = useState(true);
  const [productsOpen, setProductsOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelectedStageId(stageId);
    setContactName("");
    setObservation("");
    setProductRows([emptyProductRow()]);
    setError(null);
    setGeneralOpen(true);
    setProductsOpen(true);
  }, [open, stageId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContactsLoading(true);
    void (async () => {
      try {
        const [c, p] = await Promise.all([
          listContactsForPipeline(),
          listProducts(),
        ]);
        if (!cancelled) {
          setContacts(c);
          setProducts(p);
        }
      } catch {
        if (!cancelled) {
          setContacts([]);
          setProducts([]);
        }
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const productsTotal = useMemo(() => {
    return productRows.reduce(
      (acc, r) =>
        acc +
        parseDecimalBR(r.quantityRaw) * parseDecimalBR(r.unitPriceRaw),
      0,
    );
  }, [productRows]);

  function patchProductRow(key: string, patch: Partial<ProductRow>) {
    setProductRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addProductRow() {
    setProductRows((prev) => [...prev, emptyProductRow()]);
  }

  function removeProductRow(key: string) {
    setProductRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [emptyProductRow()] : next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const nameTrim = contactName.trim();
    if (!nameTrim) {
      setError("Informe o nome do contato.");
      return;
    }
    if (!selectedStageId) {
      setError("Selecione o status.");
      return;
    }

    const items = productRows
      .map((r) => ({
        productId: r.productId,
        productName: r.productName.trim(),
        quantity: parseDecimalBR(r.quantityRaw),
        unitPrice: parseDecimalBR(r.unitPriceRaw),
      }))
      .filter(
        (it) =>
          it.productName.length > 0 && (it.quantity > 0 || it.unitPrice > 0),
      );

    setLoading(true);
    try {
      let contactId = contacts.find(
        (c) => c.name.trim().toLowerCase() === nameTrim.toLowerCase(),
      )?.id;
      if (!contactId) {
        const created = await createContact({ name: nameTrim });
        contactId = created.id;
        setContacts((prev) =>
          [...prev, { id: created.id, name: nameTrim, phone: null }].sort(
            (a, b) =>
              a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
          ),
        );
      }

      await createDeal({
        contactId,
        pipelineId: pipeline.id,
        stageId: selectedStageId,
        title: nameTrim,
        value: items.length > 0 ? productsTotal : undefined,
        observation: observation.trim() || undefined,
        items: items.length > 0 ? items : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o registro.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[44rem] gap-0 p-0">
        <DialogTitle className="sr-only">Novo(a) Registro</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-foreground">
              Novo(a) Registro
            </h2>
            {/* O X padrão do DialogContent fica visível no canto. */}
          </header>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-muted/20 p-5">
            <Section
              title="Informações gerais"
              open={generalOpen}
              onToggle={() => setGeneralOpen((v) => !v)}
            >
              <div className="grid gap-4">
                <Field label="Status">
                  <select
                    name="stageId"
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {pipeline.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Contato">
                  <ContactNameTypeahead
                    value={contactName}
                    onChange={setContactName}
                    contacts={contacts}
                    loading={contactsLoading}
                    onContactCreated={(c) =>
                      setContacts((prev) =>
                        [...prev, c].sort((a, b) =>
                          a.name.localeCompare(b.name, "pt-BR", {
                            sensitivity: "base",
                          }),
                        ),
                      )
                    }
                  />
                </Field>

                <Field label="Observação">
                  <textarea
                    name="observation"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    rows={3}
                    className="min-h-[5rem] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Produtos"
              open={productsOpen}
              onToggle={() => setProductsOpen((v) => !v)}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_5rem_1.5rem] items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Nome</span>
                  <span>Qtde.</span>
                  <span>Preço</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                <div className="space-y-2">
                  {productRows.map((r) => {
                    const qty = parseDecimalBR(r.quantityRaw);
                    const price = parseDecimalBR(r.unitPriceRaw);
                    const lineTotal = qty * price;
                    return (
                      <div
                        key={r.key}
                        className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_5rem_1.5rem] items-center gap-3 rounded-lg bg-card px-2 py-2"
                      >
                        <ProductPicker
                          value={r.productName}
                          products={products}
                          onPick={(p) =>
                            patchProductRow(r.key, {
                              productId: p.id,
                              productName: p.name,
                              unitPriceRaw:
                                p.price > 0
                                  ? p.price.toFixed(2).replace(".", ",")
                                  : "",
                              quantityRaw:
                                productRows
                                  .find((row) => row.key === r.key)
                                  ?.quantityRaw.trim() || "1",
                            })
                          }
                          onTextChange={(name) =>
                            patchProductRow(r.key, {
                              productId: null,
                              productName: name,
                            })
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="0"
                          className="h-9"
                          value={r.quantityRaw}
                          onChange={(e) =>
                            patchProductRow(r.key, {
                              quantityRaw: e.target.value,
                            })
                          }
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] text-muted-foreground">
                            R$
                          </span>
                          <Input
                            inputMode="decimal"
                            placeholder="0,00"
                            className="h-9 flex-1"
                            value={r.unitPriceRaw}
                            onChange={(e) =>
                              patchProductRow(r.key, {
                                unitPriceRaw: e.target.value,
                              })
                            }
                          />
                        </div>
                        <span className="truncate text-right text-[13px] tabular-nums text-foreground">
                          {formatBRL(lineTotal)}
                        </span>
                        <button
                          type="button"
                          aria-label="Remover linha"
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          onClick={() => removeProductRow(r.key)}
                        >
                          <X className="size-4" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end pr-10">
                  <span className="text-[14px] font-semibold tabular-nums text-foreground">
                    {formatBRL(productsTotal)}
                  </span>
                </div>

                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={addProductRow}
                    disabled={loading}
                  >
                    <Plus className="size-3.5" strokeWidth={2} />
                    Produto
                  </Button>
                </div>
              </div>
            </Section>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-background px-5 py-3">
            {error ? (
              <p className="mr-auto text-[12px] text-destructive">{error}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || contactsLoading || !contactName.trim()}
              className="gap-1.5"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              {loading ? "Registrando…" : "Registro"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/55 bg-card/80 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={open ? `Recolher ${title}` : `Expandir ${title}`}
          onClick={onToggle}
        >
          {open ? (
            <ChevronUp className="size-4" strokeWidth={2} />
          ) : (
            <ChevronDown className="size-4" strokeWidth={2} />
          )}
        </button>
      </header>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-foreground/85">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Campo só texto: sugere nomes parecidos enquanto digita; Enter confirma sugestão ou cadastra. */
function ContactNameTypeahead({
  value,
  onChange,
  contacts,
  loading,
  onContactCreated,
}: {
  value: string;
  onChange: (v: string) => void;
  contacts: ContactOpt[];
  loading: boolean;
  onContactCreated: (c: ContactOpt) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, value]);

  const showList = focused && !loading && value.trim().length > 0;

  useEffect(() => {
    setActiveIdx(-1);
  }, [value]);

  useEffect(() => {
    if (!focused) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [focused]);

  function pick(c: ContactOpt) {
    onChange(c.name);
    setFocused(false);
    setActiveIdx(-1);
    setLocalError(null);
  }

  async function commitFreeText() {
    const name = value.trim();
    if (name.length === 0 || creating || loading) return;

    const exact = contacts.find(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exact) {
      pick(exact);
      return;
    }

    setCreating(true);
    setLocalError(null);
    try {
      const { id } = await createContact({ name });
      onContactCreated({ id, name, phone: null });
      onChange(name);
      setFocused(false);
      setActiveIdx(-1);
    } catch (e) {
      setLocalError(
        e instanceof Error
          ? e.message
          : "Não foi possível cadastrar o contato.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setLocalError(null);
        }}
        onFocus={() => setFocused(true)}
        disabled={loading || creating}
        placeholder="Digite o nome do contato…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        className="h-9 w-full"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            if (!showList || filtered.length === 0) return;
            e.preventDefault();
            setActiveIdx((i) =>
              i < 0 ? 0 : Math.min(i + 1, filtered.length - 1),
            );
            return;
          }
          if (e.key === "ArrowUp") {
            if (!showList || filtered.length === 0) return;
            e.preventDefault();
            setActiveIdx((i) => (i <= 0 ? 0 : i - 1));
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setFocused(false);
            setActiveIdx(-1);
            return;
          }
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          if (showList && filtered.length > 0) {
            const idx = activeIdx >= 0 ? activeIdx : 0;
            pick(filtered[idx]);
            return;
          }
          void commitFreeText();
        }}
      />
      {localError ? (
        <p className="mt-1 text-[12px] text-destructive">{localError}</p>
      ) : null}
      {showList ? (
        <ul
          className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-48 overflow-auto rounded-md border border-border/60 bg-popover py-1 text-popover-foreground shadow-md"
          role="listbox"
        >
          {creating ? (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">
              Cadastrando contato…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">
              Nenhum nome parecido. Enter cadastra &quot;{value.trim()}&quot; como
              novo contato.
            </li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-sm transition-colors",
                    i === activeIdx ? "bg-muted" : "hover:bg-muted/70",
                  )}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(c)}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Botão “+” circular no topo da coluna Kanban (abre o mesmo diálogo que o rodapé). */
export function PipelineColumnNewDealHeaderButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Novo lead nesta etapa"
      title="Novo lead nesta etapa"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors",
        "hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "dark:border-border/50 dark:bg-card",
      )}
      onClick={onClick}
    >
      <Plus className="size-[18px]" strokeWidth={2} />
    </button>
  );
}

/** Área tracejada “ADICIONAR” no rodapé da coluna Kanban. */
export function PipelineColumnNewDealFooterTrigger({
  onClick,
  accentHex,
}: {
  onClick: () => void;
  /** Cor da etapa (hex) para borda/tracejado e texto, alinhado ao Kanban. */
  accentHex?: string | null;
}) {
  const hex = normalizedStageHex(accentHex, "#94a3b8");
  return (
    <button
      type="button"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-transparent py-4 transition-colors",
        "hover:bg-background/40",
      )}
      style={{
        borderColor: `color-mix(in srgb, ${hex} 45%, var(--border))`,
        color: hex,
      }}
      onClick={onClick}
    >
      <span
        className="flex size-8 items-center justify-center rounded-full border bg-background/80"
        style={{ borderColor: `color-mix(in srgb, ${hex} 55%, var(--border))` }}
      >
        <Plus className="size-4" strokeWidth={2} />
      </span>
      <span className="text-[7.5px] font-bold uppercase tracking-wide">
        Adicionar
      </span>
    </button>
  );
}

export function PipelineNewDeal({
  pipeline,
  defaultStageId,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  defaultStageId?: string;
}) {
  const [open, setOpen] = useState(false);
  const stageId = defaultStageId ?? pipeline.stages[0]?.id;

  if (!stageId) return null;

  return (
    <>
      <Button type="button" className="shrink-0 font-medium" onClick={() => setOpen(true)}>
        + Novo lead
      </Button>
      <PipelineNewDealDialog
        open={open}
        onOpenChange={setOpen}
        pipeline={pipeline}
        stageId={stageId}
      />
    </>
  );
}
