"use client";

import type { ProductCollectionRow } from "@/actions/product-collections";
import {
  createProductCollection,
  deleteProductCollection,
  updateProductCollection,
} from "@/actions/product-collections";
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
import { ChevronRight, Layers, Package, Plus, Pencil, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export type ProductRow = {
  id: string;
  name: string;
  price: number;
  collection: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

const selectTriggerClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

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
  initialCollections,
}: {
  initialProducts: ProductRow[];
  initialCollections: ProductCollectionRow[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("0,00");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);

  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const [manageCollectionsOpen, setManageCollectionsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const sorted = useMemo(() => {
    const copy = [...initialProducts];
    copy.sort((a, b) => {
      const ac = a.collection?.name ?? "\uffff";
      const bc = b.collection?.name ?? "\uffff";
      const byCollection = ac.localeCompare(bc, "pt-BR");
      if (byCollection !== 0) return byCollection;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    return copy;
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.collection?.name ?? "").toLowerCase().includes(q)) return true;
      if (formatCurrency(p.price).toLowerCase().includes(q)) return true;
      const raw = String(p.price);
      if (raw.includes(q)) return true;
      return false;
    });
  }, [sorted, searchQuery]);

  const sortedCollections = useMemo(
    () =>
      [...initialCollections].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
    [initialCollections],
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPriceText("0,00");
    setCollectionId("");
    setDialogOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setName(p.name);
    setPriceText(defaultPriceInput(p.price));
    setCollectionId(p.collection?.id ?? "");
    setDialogOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseMoneyBr(priceText);
    if (price === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const resolvedCollectionId = collectionId ? collectionId : null;
    setBusy(true);
    try {
      if (editing) {
        await updateProduct({
          id: editing.id,
          name: trimmedName,
          price,
          collectionId: resolvedCollectionId,
        });
      } else {
        await createProduct({
          name: trimmedName,
          price,
          collectionId: resolvedCollectionId,
        });
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

  async function onCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    const n = newCollectionName.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createProductCollection({ name: n });
      setNewCollectionName("");
      setNewCollectionOpen(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function startRename(c: ProductCollectionRow) {
    setRenamingId(c.id);
    setRenameText(c.name);
  }

  async function saveRename() {
    if (!renamingId) return;
    const n = renameText.trim();
    if (!n) return;
    setBusy(true);
    try {
      await updateProductCollection({ id: renamingId, name: n });
      setRenamingId(null);
      setRenameText("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCollection(c: ProductCollectionRow) {
    if (
      !globalThis.confirm(
        `Excluir a coleção "${c.name}"? Os produtos desta coleção ficarão sem coleção.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteProductCollection(c.id);
      if (renamingId === c.id) {
        setRenamingId(null);
        setRenameText("");
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const showToolbar = sorted.length > 0 || sortedCollections.length > 0;

  return (
    <>
      {showToolbar ? (
        <div className="mb-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 rounded-lg"
            onClick={() => setManageCollectionsOpen(true)}
          >
            <Layers className="size-4" strokeWidth={2} />
            Coleções
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 rounded-lg"
            onClick={() => {
              setNewCollectionName("");
              setNewCollectionOpen(true);
            }}
          >
            <Plus className="size-4" strokeWidth={2} />
            Coleção
          </Button>
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
            {showToolbar ? (
              <>
                {" "}
                ou use os botões acima para coleções.
              </>
            ) : null}
          </p>
          {!showToolbar ? (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 rounded-lg"
                onClick={() => setManageCollectionsOpen(true)}
              >
                <Layers className="size-4" strokeWidth={2} />
                Coleções
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 rounded-lg"
                onClick={() => {
                  setNewCollectionName("");
                  setNewCollectionOpen(true);
                }}
              >
                <Plus className="size-4" strokeWidth={2} />
                Coleção
              </Button>
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
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/50">
            <label
              htmlFor="products-search"
              className="flex cursor-text items-center gap-3 px-4 py-2.5 sm:px-5"
            >
              <Search
                className="size-4 shrink-0 text-muted-foreground/70"
                strokeWidth={2}
                aria-hidden
              />
              <input
                id="products-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar e filtrar"
                autoComplete="off"
                className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground/75 focus-visible:ring-0"
                aria-label="Pesquisar e filtrar produtos"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 sm:px-5">Produto</th>
                  <th className="px-4 py-3">Coleção</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="w-10 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
                    >
                      {searchQuery.trim()
                        ? `Nenhum produto corresponde a “${searchQuery.trim()}”.`
                        : "Nenhum produto."}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
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
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.collection ? (
                        p.collection.name
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatCurrency(p.price)}
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <ChevronRight className="ml-auto size-4 opacity-60" />
                    </td>
                  </tr>
                  ))
                )}
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
                <Label htmlFor="product-collection">Coleção</Label>
                <select
                  id="product-collection"
                  className={selectTriggerClass}
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Sem coleção</option>
                  {sortedCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Opcional. Crie coleções pelos botões acima da lista.
                </p>
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

      <Dialog open={newCollectionOpen} onOpenChange={setNewCollectionOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle className="text-base font-semibold">
              Nova coleção
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateCollection}>
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="space-y-2">
                <Label htmlFor="new-collection-name">
                  <span className="text-destructive">*</span> Nome
                </Label>
                <Input
                  id="new-collection-name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Ex.: Vestuário formal"
                  required
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setNewCollectionOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageCollectionsOpen}
        onOpenChange={setManageCollectionsOpen}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle className="text-base font-semibold">
              Coleções
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(360px,50vh)] overflow-y-auto px-4 py-3 sm:px-5">
            {sortedCollections.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma coleção ainda. Use &quot;+ Coleção&quot; para criar.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {sortedCollections.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 py-3 first:pt-0"
                  >
                    {renamingId === c.id ? (
                      <>
                        <Input
                          className="min-w-0 flex-1"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          disabled={busy}
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void saveRename()}
                        >
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setRenamingId(null);
                            setRenameText("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 font-medium text-foreground">
                          {c.name}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(c);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Renomear
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteCollection(c);
                          }}
                        >
                          Excluir
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManageCollectionsOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
