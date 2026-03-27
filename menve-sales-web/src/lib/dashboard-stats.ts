import prisma from "@/lib/prisma";

/** Últimos 30 dias (inclusive), início do dia local aproximado via UTC slice */
export function dealsCreatedByDayLast30(tenantId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  return prisma.deal.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: { createdAt: true },
  });
}

export function buildDailyCounts(
  rows: { createdAt: Date }[],
  days = 30,
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}
