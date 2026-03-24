import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { ActivitiesClient } from "./activities-client";

export default async function ActivitiesPage() {
  const tenantId = await getActiveTenantId();
  const activities = await prisma.activity.findMany({
    where: { tenantId },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: { contact: true, deal: true, user: true },
    take: 100,
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Atividades</h1>
        <p className="text-muted-foreground">
          Tarefas e interações registradas pela equipe.
        </p>
      </div>
      <ActivitiesClient activities={activities} />
    </div>
  );
}
