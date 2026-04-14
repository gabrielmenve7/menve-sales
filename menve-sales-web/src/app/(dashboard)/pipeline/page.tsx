import { Suspense } from "react";
import { PipelineMain } from "./pipeline-main";
import { PipelineViewSkeleton } from "./pipeline-view";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string; tab?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <Suspense fallback={<PipelineViewSkeleton />}>
        <PipelineMain searchParams={sp} />
      </Suspense>
    </div>
  );
}
