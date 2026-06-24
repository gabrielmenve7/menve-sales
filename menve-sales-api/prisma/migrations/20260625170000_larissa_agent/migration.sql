-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('LEAD', 'HUMAN_AGENT', 'AI_AGENT', 'SYSTEM', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "ConversationQualificationMode" AS ENUM ('NONE', 'AI_ACTIVE', 'AI_PAUSED', 'HUMAN_HANDOFF', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN "larissaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "larissaModel" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "larissaReplyDelayMs" INTEGER NOT NULL DEFAULT 1500;

-- CreateTable AiAgent
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable AiAgentSkill
CREATE TABLE "AiAgentSkill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourcePath" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable AgentRun
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "triggerMessageId" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "error" TEXT,
    "toolCalls" JSONB,
    "skillVersionSnapshot" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable Conversation
ALTER TABLE "Conversation" ADD COLUMN "qualificationMode" "ConversationQualificationMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Conversation" ADD COLUMN "aiAgentId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "aiPausedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "handoffAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "handoffReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "outreachRecipientId" TEXT;

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN "senderType" "MessageSenderType" NOT NULL DEFAULT 'LEAD';
ALTER TABLE "Message" ADD COLUMN "aiAgentId" TEXT;
ALTER TABLE "Message" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "Message" ADD COLUMN "outreachCampaignId" TEXT;

-- Backfill senderType for existing messages
UPDATE "Message" SET "senderType" = 'HUMAN_AGENT' WHERE "direction" = 'OUTBOUND' AND "userId" IS NOT NULL;
UPDATE "Message" SET "senderType" = 'LEAD' WHERE "direction" = 'INBOUND';
UPDATE "Message" SET "senderType" = 'SYSTEM' WHERE "direction" = 'OUTBOUND' AND "userId" IS NULL AND "senderType" = 'LEAD';

-- Seed Larissa agent
INSERT INTO "AiAgent" ("id", "key", "displayName", "description", "isActive", "createdAt", "updatedAt")
VALUES ('larissa-agent-seed', 'larissa', 'Larissa', 'Agente SDR de qualificação pós-disparo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgent_key_key" ON "AiAgent"("key");
CREATE UNIQUE INDEX "AiAgentSkill_tenantId_agentId_skillKey_key" ON "AiAgentSkill"("tenantId", "agentId", "skillKey");
CREATE INDEX "AiAgentSkill_tenantId_agentId_idx" ON "AiAgentSkill"("tenantId", "agentId");
CREATE INDEX "AgentRun_conversationId_startedAt_idx" ON "AgentRun"("conversationId", "startedAt");
CREATE INDEX "AgentRun_tenantId_status_startedAt_idx" ON "AgentRun"("tenantId", "status", "startedAt");
CREATE INDEX "Conversation_tenantId_qualificationMode_lastMessageAt_idx" ON "Conversation"("tenantId", "qualificationMode", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_outreachRecipientId_fkey" FOREIGN KEY ("outreachRecipientId") REFERENCES "OutreachCampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_outreachCampaignId_fkey" FOREIGN KEY ("outreachCampaignId") REFERENCES "OutreachCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAgentSkill" ADD CONSTRAINT "AiAgentSkill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAgentSkill" ADD CONSTRAINT "AiAgentSkill_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
