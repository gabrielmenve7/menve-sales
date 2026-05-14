"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { listContactsForPipeline } from "@/actions/contacts";
import { createDeal } from "@/actions/deals";
import { listProducts, type ProductOption } from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

const PRIORITY_OPTIONS: { value: string; label: string; probability: number }[] =
  [
    { value: "high", label: "Alta", probability: 0.75 },
    { value: "medium", label: "Média", probability: 0.5 },
    { value: "low", label: "Baixa", probability: 0.25 },
  ];

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
  const [contactId, setContactId] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
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
    setContactId("");
    setPriority("");
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

    if (!contactId) {
      setError("Selecione um contato.");
      return;
    }
    if (!selectedStageId) {
      setError("Selecione o status.");
      return;
    }

    const contact = contacts.find((c) => c.id === contactId);
    const title = (contact?.name ?? "").trim() || "Nova oportunidade";
    const probability = PRIORITY_OPTIONS.find((p) => p.value === priority)
      ?.probability;

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
      await createDeal({
        contactId,
        pipelineId: pipeline.id,
        stageId: selectedStageId,
        title,
        value: items.length > 0 ? productsTotal : undefined,
        probability: probability ?? null,
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
                    className="h-9 w-full max-w-[14rem] rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {pipeline.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contato">
                    <ContactPicker
                      contactId={contactId}
                      contacts={contacts}
                      loading={contactsLoading}
                      onPick={(id) => setContactId(id)}
                    />
                  </Field>
                  <Field label="Prioridade">
                    <select
                      name="priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">—</option>
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

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
              disabled={loading || contactsLoading || !contactId}
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

function ContactPicker({
  contactId,
  contacts,
  loading,
  onPick,
}: {
  contactId: string;
  contacts: ContactOpt[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = contacts.find((c) => c.id === contactId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const inName = c.name.toLowerCase().includes(q);
      const inPhone = (c.phone ?? "").toLowerCase().includes(q);
      return inName || inPhone;
    });
  }, [contacts, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={loading}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm outline-none transition-colors",
            "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !selected && "italic text-muted-foreground",
            )}
          >
            {loading
              ? "Carregando…"
              : selected
                ? `${selected.name}${selected.phone ? ` (${selected.phone})` : ""}`
                : "Escolha, ou digite para buscar"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          placeholder="Buscar contato…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-9"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              Nenhum contato encontrado.
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(c.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="min-w-0 truncate">{c.name}</span>
                {c.phone ? (
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {c.phone}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
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
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-transparent py-4 text-muted-foreground transition-colors",
        "hover:border-foreground/20 hover:bg-background/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-border/80 text-foreground">
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
