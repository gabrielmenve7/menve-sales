"use client";

import { ChevronRight, Package, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ProductRow = {
  id: string;
  name: string;
  price: number;
  createdAt: string;
  updatedAt: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Interpreta texto como valor em reais (ex.: "1.234,56" ou "190"). */
function parseMoneyBr(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function defaultPriceInput(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function ProductsClient({
  initialProducts,
}: {
  initialProducts: ProductRow[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("0,00");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...initialProducts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [initialProducts],
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPriceText("0,00");
    setDialogOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setName(p.name);
    setPriceText(defaultPriceInput(p.price));
    setDialogOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseMoneyBr(priceText);
    if (price === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      if (editing) {
        await updateProduct({
          id: editing.id,
          name: trimmedName,
          price,
        });
      } else {
        await createProduct({ name: trimmedName, price });
      }
      setDialogOpen(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    if (
      !globalThis.confirm(
        `Excluir o produto "${editing.name}"? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteProduct(editing.id);
      setDialogOpen(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {sorted.length > 0 ? (
        <div className="mb-6 flex justify-end">
          <Button
            type="button"
            className="gap-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90"
            onClick={openCreate}
          >
            <Plus className="size-4" strokeWidth={2} />
            Produto
          </Button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border/60 bg-card px-6 py-16 text-center shadow-sm">
          <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted">
            <Package
              className="size-8 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            Você ainda não tem produtos
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Para começar a usar esta ferramenta, crie um novo produto
          </p>
          <Button
            type="button"
            className="mt-8 gap-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90"
            onClick={openCreate}
          >
            <Plus className="size-4" strokeWidth={2} />
            Produto
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="w-10 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "cursor-pointer border-b border-border/40 transition-colors last:border-0",
                      "hover:bg-muted/40",
                    )}
                    onClick={() => openEdit(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(p);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatCurrency(p.price)}
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <ChevronRight className="ml-auto size-4 opacity-60" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle className="text-base font-semibold">
              {editing ? "Editar produto" : "Novo produto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit}>
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="space-y-2">
                <Label htmlFor="product-name">
                  <span className="text-destructive">*</span> Nome
                </Label>
                <Input
                  id="product-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Terno"
                  required
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-price">
                  <span className="text-destructive">*</span> Preço
                </Label>
                <div className="flex items-stretch gap-2 rounded-md border border-input bg-background shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <span className="flex shrink-0 items-center border-r border-input px-3 text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="product-price"
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={busy}
                    aria-describedby="product-price-hint"
                  />
                </div>
                <p
                  id="product-price-hint"
                  className="text-xs text-muted-foreground"
                >
                  Use vírgula para centavos (ex.: 1.234,56).
                </p>
              </div>
            </div>
            <DialogFooter className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="order-last w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:order-first sm:mr-auto sm:w-auto"
                  disabled={busy}
                  onClick={onDelete}
                >
                  Excluir
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="gap-1">
                {editing ? (
                  "Salvar"
                ) : (
                  <>
                    <Plus className="size-4" strokeWidth={2} />
                    Produto
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
