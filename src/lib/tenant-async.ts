import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto opcional de tenant por request (Node).
 * Use `runWithTenantContext` em wrappers de servidor se quiser
 * propagar tenantId sem passar parâmetro em todas as camadas.
 * Hoje o app usa `getTenantFromRequest()` + `getActiveTenantId()` nas actions.
 */
export type TenantContext = { tenantId: string; slug: string };

export const tenantAsyncLocalStorage =
  new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  ctx: TenantContext,
  fn: () => T,
): T {
  return tenantAsyncLocalStorage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantAsyncLocalStorage.getStore();
}
