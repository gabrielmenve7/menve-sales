import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Healthcheck para load balancer / monitoramento (Fase 5 — deploy).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      ts: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, db: "down" },
      { status: 503 },
    );
  }
}
