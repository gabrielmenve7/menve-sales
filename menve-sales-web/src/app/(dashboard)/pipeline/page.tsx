import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { PipelineView } from "./pipeline-view";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string }>;
}) {
  const { pipelineId: queryPipelineId } = await searchParams;
  const tenantId = await getActiveTenantId();

  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });

  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (pipelines.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Nenhum pipeline configurado. Crie um funil em Configurações.
        </p>
      </div>
    );
  }

  const activePipeline =
    pipelines.find((p) => p.id === queryPipelineId) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];

  const [deals, openSum, wonCount, lostCount] = await Promise.all([
    prisma.deal.findMany({
      where: {
        tenantId,
        pipelineId: activePipeline.id,
        status: "OPEN",
      },
      include: {
        contact: { include: { campaignSource: true } },
        stage: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.aggregate({
      where: {
        tenantId,
        pipelineId: activePipeline.id,
        status: "OPEN",
      },
      _sum: { value: true },
    }),
    prisma.deal.count({
      where: {
        tenantId,
        pipelineId: activePipeline.id,
        status: "WON",
      },
    }),
    prisma.deal.count({
      where: {
        tenantId,
        pipelineId: activePipeline.id,
        status: "LOST",
      },
    }),
  ]);

  const openCount = deals.length;
  const stats = {
    openCount,
    openSum: Number(openSum._sum.value ?? 0),
    wonCount,
    lostCount,
  };

  return (
    <div className="p-6">
      <PipelineView
        pipelines={pipelines}
        activePipeline={activePipeline}
        deals={deals}
        contacts={contacts}
        stats={stats}
      />
    </div>
  );
}
