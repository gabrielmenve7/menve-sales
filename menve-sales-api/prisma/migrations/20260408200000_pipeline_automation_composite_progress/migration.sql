-- Gatilho COMPOSITE + tabela de progresso (bitmask) para regras compostas
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'COMPOSITE';

CREATE TABLE "PipelineAutomationAndProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "mask" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PipelineAutomationAndProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PipelineAutomationAndProgress_ruleId_dealId_key" ON "PipelineAutomationAndProgress"("ruleId", "dealId");

CREATE INDEX "PipelineAutomationAndProgress_tenantId_ruleId_idx" ON "PipelineAutomationAndProgress"("tenantId", "ruleId");

ALTER TABLE "PipelineAutomationAndProgress" ADD CONSTRAINT "PipelineAutomationAndProgress_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PipelineAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PipelineAutomationAndProgress" ADD CONSTRAINT "PipelineAutomationAndProgress_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
