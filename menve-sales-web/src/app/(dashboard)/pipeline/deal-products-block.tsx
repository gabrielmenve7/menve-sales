"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getDealItems,
  replaceDealItems,
  type DealItemRow,
} from "@/actions/deals";
import { listProducts, type ProductOption } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Row = {
  /** Chave estável para React; não vai pro servidor. */
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

/** "1.234,56" / "1234.56" → 1234.56. Aceita string vazia (→ 0). */
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

function rowFromServer(it: DealItemRow): Row {
  return {
    key: it.id,
    productId: it.productId,
    productName: it.productName,
    quantityRaw: it.quantity > 0 ? String(it.quantity).replace(".", ",") : "",
    unitPriceRaw:
      it.unitPrice > 0 ? it.unitPrice.toFixed(2).replace(".", ",") : "",
  };
}

function emptyRow(): Row {
  return {
    key: uid(),
    productId: null,
    productName: "",
    quantityRaw: "",
    unitPriceRaw: "",
  };
}

export function DealProductsBlock({
  dealId,
  onSaved,
}: {
  dealId: string;
  /** Chamado após salvar (passa o novo `Deal.value` calculado para sincronizar o pai). */
  onSaved?: (total: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [baselineKey, setBaselineKey] = useState<string>("");

  function rowsSignature(list: Row[]): string {
    return JSON.stringify(
      list.map((r) => ({
        p: r.productId,
        n: r.productName.trim(),
        q: parseDecimalBR(r.quantityRaw),
        u: parseDecimalBR(r.unitPriceRaw),
      })),
    );
  }

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setLoading(true);
    setCatalogLoading(true);
    setError(null);
    void (async () => {
      try {
        const items = await getDealItems(dealId);
        if (cancelled) return;
        const initial =
          items.length > 0 ? items.map(rowFromServer) : [emptyRow()];
        setRows(initial);
        setBaselineKey(rowsSignature(initial));
        setLoading(false);

        void listProducts()
          .then((prods) => {
            if (cancelled) return;
            setProducts(prods);
          })
          .catch((e) => {
            if (cancelled) return;
            console.error("[deal-products] listProducts:", e);
            setProducts([]);
          })
          .finally(() => {
            if (cancelled) return;
            setCatalogLoading(false);
          });
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Não foi possível carregar produtos.",
        );
        setLoading(false);
        setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  const total = useMemo(() => {
    return rows.reduce(
      (acc, r) =>
        acc + parseDecimalBR(r.quantityRaw) * parseDecimalBR(r.unitPriceRaw),
      0,
    );
  }, [rows]);

  const dirty = useMemo(() => rowsSignature(rows) !== baselineKey, [
    rows,
    baselineKey,
  ]);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [emptyRow()] : next;
    });
  }

  function pickProduct(rowKey: string, product: ProductOption) {
    patchRow(rowKey, {
      productId: product.id,
      productName: product.name,
      unitPriceRaw:
        product.price > 0 ? product.price.toFixed(2).replace(".", ",") : "",
      quantityRaw:
        rows.find((r) => r.key === rowKey)?.quantityRaw.trim() || "1",
    });
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = rows
        .map((r) => ({
          productId: r.productId,
          productName: r.productName.trim(),
          quantity: parseDecimalBR(r.quantityRaw),
          unitPrice: parseDecimalBR(r.unitPriceRaw),
        }))
        /** Linhas vazias (sem nome) ou com qty/price zerados são descartadas. */
        .filter(
          (it) =>
            it.productName.length > 0 && (it.quantity > 0 || it.unitPrice > 0),
        );
      const res = await replaceDealItems(dealId, { items: payload });
      onSaved?.(payload.length > 0 ? res.total : 0);
      setBaselineKey(rowsSignature(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar produtos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/55 bg-muted/15 p-4">
      <header className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold uppercase tracking-wider text-foreground">
          Produtos
        </h4>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={open ? "Recolher produtos" : "Expandir produtos"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronUp className="size-4" strokeWidth={2} />
          ) : (
            <ChevronDown className="size-4" strokeWidth={2} />
          )}
        </button>
      </header>

      {open ? (
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="py-2 text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_5rem_1.5rem] items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Nome</span>
                <span>Qtde.</span>
                <span>Preço</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              <div className="space-y-2">
                {rows.map((r) => {
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
                        catalogLoading={catalogLoading}
                        onPick={(p) => pickProduct(r.key, p)}
                        onTextChange={(name) =>
                          patchRow(r.key, { productId: null, productName: name })
                        }
                      />
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        className="h-9"
                        value={r.quantityRaw}
                        onChange={(e) =>
                          patchRow(r.key, { quantityRaw: e.target.value })
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
                            patchRow(r.key, { unitPriceRaw: e.target.value })
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
                        onClick={() => removeRow(r.key)}
                      >
                        <X className="size-4" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end pr-10">
                <span className="text-[14px] font-semibold tabular-nums text-foreground">
                  {formatBRL(total)}
                </span>
              </div>

              {error ? (
                <p className="text-[12px] text-destructive">{error}</p>
              ) : null}

              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addRow}
                  disabled={saving}
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  Produto
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onSave()}
                  disabled={saving || !dirty}
                >
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ProductPicker({
  value,
  products,
  catalogLoading = false,
  onPick,
  onTextChange,
}: {
  value: string;
  products: ProductOption[];
  /** Catálogo ainda a carregar (lista de produtos do tenant). */
  catalogLoading?: boolean;
  onPick: (p: ProductOption) => void;
  onTextChange: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm outline-none transition-colors",
            "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !value && "italic text-muted-foreground",
            )}
          >
            {value || "Selecionar…"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(100vw-2rem,18rem)] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          placeholder="Buscar produto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-9"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {catalogLoading && products.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              Carregando catálogo…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {formatBRL(p.price)}
                </span>
              </button>
            ))
          )}
        </div>
        {query.trim() && !filtered.some((p) => p.name === query.trim()) ? (
          <button
            type="button"
            className="mt-2 w-full rounded-md border border-dashed border-border/70 px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            onClick={() => {
              onTextChange(query.trim());
              setOpen(false);
              setQuery("");
            }}
          >
            Usar “{query.trim()}” como item avulso
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
