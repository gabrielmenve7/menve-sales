-- CreateEnum
CREATE TYPE "PipelineAutomationTriggerType" AS ENUM ('DEAL_CREATED', 'DEAL_ENTERED_STAGE', 'DEAL_LEFT_STAGE', 'DEAL_MARKED_WON', 'DEAL_MARKED_LOST');

-- CreateEnum
CREATE TYPE "PipelineAutomationRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "PipelineAutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "triggerType" "PipelineAutomationTriggerType" NOT NULL,
    "triggerFilter" JSONB,
    "actions" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineAutomationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "triggerType" "PipelineAutomationTriggerType" NOT NULL,
    "status" "PipelineAutomationRunStatus" NOT NULL,
    "errorMessage" TEXT,
    "executedActions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineAutomationRule_tenantId_pipelineId_enabled_idx" ON "PipelineAutomationRule"("tenantId", "pipelineId", "enabled");

-- CreateIndex
CREATE INDEX "PipelineAutomationRun_tenantId_ruleId_idx" ON "PipelineAutomationRun"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "PipelineAutomationRun_tenantId_dealId_createdAt_idx" ON "PipelineAutomationRun"("tenantId", "dealId", "createdAt");

-- AddForeignKey
ALTER TABLE "PipelineAutomationRule" ADD CONSTRAINT "PipelineAutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomationRule" ADD CONSTRAINT "PipelineAutomationRule_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomationRule" ADD CONSTRAINT "PipelineAutomationRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomationRun" ADD CONSTRAINT "PipelineAutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PipelineAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomationRun" ADD CONSTRAINT "PipelineAutomationRun_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
