-- CreateEnum
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutreachRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'REPLIED', 'FAILED', 'OPT_OUT');

-- AlterEnum
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'PROSPECT_REPLIED';

-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE 'ZAPPFY';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "meetLink" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "leadScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadScoreUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "leadScoringRules" JSONB,
ADD COLUMN     "outreachThrottleSeconds" INTEGER NOT NULL DEFAULT 45;

-- CreateTable
CREATE TABLE "ProspectList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "prospectResultId" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateBody" TEXT NOT NULL,
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "status" "OutreachRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "contactId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "nextSendAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSequenceStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "delayDays" INTEGER NOT NULL DEFAULT 3,
    "templateBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachSequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGoogleCalendar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "calendarId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoogleCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectList_tenantId_createdAt_idx" ON "ProspectList"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectListItem_listId_idx" ON "ProspectListItem"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectListItem_listId_prospectResultId_key" ON "ProspectListItem"("listId", "prospectResultId");

-- CreateIndex
CREATE INDEX "OutreachCampaign_tenantId_status_idx" ON "OutreachCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutreachCampaignRecipient_campaignId_status_idx" ON "OutreachCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaignRecipient_campaignId_phone_key" ON "OutreachCampaignRecipient"("campaignId", "phone");

-- CreateIndex
CREATE INDEX "OutreachSequenceStep_campaignId_sortOrder_idx" ON "OutreachSequenceStep"("campaignId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UserGoogleCalendar_userId_key" ON "UserGoogleCalendar"("userId");

-- AddForeignKey
ALTER TABLE "ProspectList" ADD CONSTRAINT "ProspectList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectList" ADD CONSTRAINT "ProspectList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectListItem" ADD CONSTRAINT "ProspectListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ProspectList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectListItem" ADD CONSTRAINT "ProspectListItem_prospectResultId_fkey" FOREIGN KEY ("prospectResultId") REFERENCES "ProspectResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectListItem" ADD CONSTRAINT "ProspectListItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ProspectList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSequenceStep" ADD CONSTRAINT "OutreachSequenceStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoogleCalendar" ADD CONSTRAINT "UserGoogleCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
