import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSubdomain, resolveTenantSlug } from "@/lib/tenant-edge";

/**
 * Bundle mínimo para o Edge (limite 1 MB no plano Hobby da Vercel).
 * Não importar `next-auth/jwt` nem `@/auth` — ainda assim passavam de 1 MB.
 *
 * Aqui só verificamos se o cookie de sessão do Auth.js existe; a validade do JWT
 * é conferida nas rotas/API com `auth()`.
 */
function hasSessionCookie(req: NextRequest): boolean {
  const c = req.headers.get("cookie") ?? "";
  return (
    c.includes("__Secure-authjs.session-token=") ||
    c.includes("authjs.session-token=") ||
    c.includes("__Secure-next-auth.session-token=") ||
    c.includes("next-auth.session-token=")
  );
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const sub = getSubdomain(host);
  const slug = resolveTenantSlug(sub, process.env.DEFAULT_TENANT_SLUG);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);

  const path = req.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/setup") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/webhooks");

  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!hasSessionCookie(req)) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
