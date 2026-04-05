import { NextResponse } from "next/server";

/**
 * Healthcheck para load balancer / Playwright — repassa para o Nest (`GET /health`).
 */
export async function GET() {
  const base =
    process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "application/json";
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": ct } });
  } catch {
    return NextResponse.json(
      { ok: false, db: "down", api: "unreachable" },
      { status: 503 },
    );
  }
}
