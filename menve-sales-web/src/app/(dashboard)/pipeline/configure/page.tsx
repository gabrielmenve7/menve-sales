import type { Pipeline, Stage } from "@prisma/client";
import { redirect } from "next/navigation";
import { apiServer } from "@/lib/api-server";
import { canConfigureTenant } from "@/lib/session";
import { FunnelConfigureClient } from "./funnel-configure-client";

type PipelineRow = Pipeline & { stages: Stage[] };

export default async function PipelineFunnelConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string }>;
}) {
  const allowed = await canConfigureTenant();
  if (!allowed) redirect("/pipeline");

  const sp = await searchParams;
  const pipelines = await apiServer<PipelineRow[]>("/pipelines");
  if (pipelines.length === 0) redirect("/pipeline");

  const activeId =
    pipelines.find((p) => p.id === sp.pipelineId)?.id ??
    pipelines.find((p) => p.isDefault)?.id ??
    pipelines[0]!.id;

  const backQs = new URLSearchParams();
  backQs.set("pipelineId", activeId);
  const backHref = `/pipeline?${backQs.toString()}`;

  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col md:-m-5">
      <FunnelConfigureClient pipelines={pipelines} backHref={backHref} />
    </div>
  );
}
