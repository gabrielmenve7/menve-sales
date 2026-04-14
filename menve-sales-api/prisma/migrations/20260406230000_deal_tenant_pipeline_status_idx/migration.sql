-- Pipeline board: filter open deals and status counts by pipeline.
CREATE INDEX "Deal_tenantId_pipelineId_status_idx" ON "Deal" ("tenantId", "pipelineId", "status");
