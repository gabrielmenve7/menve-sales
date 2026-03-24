/** Usado no middleware (Edge) — sem Prisma */
export function getSubdomain(host: string): string | null {
  const hostOnly = host.split(":")[0]?.toLowerCase() ?? "";
  const parts = hostOnly.split(".");
  if (parts.length < 2) return null;
  const sub = parts[0];
  if (!sub || sub === "www") return null;
  return sub;
}
