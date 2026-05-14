import type { ProductCollectionRow } from "@/actions/product-collections";
import { apiServer } from "@/lib/api-server";
import { ProductsClient, type ProductRow } from "./products-client";

export default async function ProdutosPage() {
  const [products, collections] = await Promise.all([
    apiServer<ProductRow[]>("/products"),
    apiServer<ProductCollectionRow[]>("/product-collections"),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro de itens e valores para usar nas oportunidades do funil.
          </p>
        </div>
      </div>
      <ProductsClient
        initialProducts={products}
        initialCollections={collections}
      />
    </div>
  );
}
