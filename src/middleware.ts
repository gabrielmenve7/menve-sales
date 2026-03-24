import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getSubdomain } from "@/lib/tenant-edge";

export default auth((req) => {
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

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
