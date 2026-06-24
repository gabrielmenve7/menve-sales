-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "pipelineVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "pipelineEnteredAt" TIMESTAMP(3);

-- Backfill: deals existentes permanecem visíveis na Gestão de leads
UPDATE "Deal"
SET "pipelineVisible" = true,
    "pipelineEnteredAt" = COALESCE("pipelineEnteredAt", "createdAt")
WHERE "pipelineVisible" = false;

-- AlterEnum
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'DEAL_ENTERED_PIPELINE';

-- CreateIndex
CREATE INDEX "Deal_tenantId_pipelineId_pipelineVisible_idx" ON "Deal"("tenantId", "pipelineId", "pipelineVisible");
