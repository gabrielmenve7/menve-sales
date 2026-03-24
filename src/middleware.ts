import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSubdomain } from "@/lib/tenant-edge";

/**
 * Não importar `@/auth` aqui: isso puxa bcrypt + Prisma no bundle Edge e estoura
 * o limite de 1 MB do plano Hobby na Vercel. Só validamos o JWT da sessão.
 */
export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const sub = getSubdomain(host);
  const slug = sub ?? process.env.DEFAULT_TENANT_SLUG ?? "demo";

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);

  const path = req.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/webhooks");

  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const token = await getToken({
    req,
    secret,
  });

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
