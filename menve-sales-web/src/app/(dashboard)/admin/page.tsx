import prisma from "@/lib/prisma";
import { canAccessAdmin } from "@/lib/session";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminPage() {
  const ok = await canAccessAdmin();
  if (!ok) redirect("/dashboard");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { contacts: true, deals: true, users: true },
      },
    },
  });

  const tenantStats = await Promise.all(
    tenants.map(async (t) => {
      const [openDeals, wonDeals, lostDeals] = await Promise.all([
        prisma.deal.count({
          where: { tenantId: t.id, status: "OPEN" },
        }),
        prisma.deal.count({
          where: { tenantId: t.id, status: "WON" },
        }),
        prisma.deal.count({
          where: { tenantId: t.id, status: "LOST" },
        }),
      ]);
      return { tenantId: t.id, openDeals, wonDeals, lostDeals };
    }),
  );

  const statMap = new Map(tenantStats.map((s) => [s.tenantId, s]));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Admin Menve</h1>
        <p className="text-muted-foreground">
          Visão consolidada cross-tenant para otimização de campanhas.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {tenants.map((t) => {
          const s = statMap.get(t.id);
          return (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>slug: {t.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Plano: {t.plan}</p>
                <p>Usuários: {t._count.users}</p>
                <p>Contatos: {t._count.contacts}</p>
                <p>Deals (total registros): {t._count.deals}</p>
                {s ? (
                  <div className="mt-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-foreground">
                    <p className="font-medium text-foreground">Pipeline</p>
                    <p>Abertos: {s.openDeals}</p>
                    <p className="text-emerald-600 dark:text-emerald-400">
                      Ganhos: {s.wonDeals}
                    </p>
                    <p className="text-rose-600 dark:text-rose-400">
                      Perdidos: {s.lostDeals}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
