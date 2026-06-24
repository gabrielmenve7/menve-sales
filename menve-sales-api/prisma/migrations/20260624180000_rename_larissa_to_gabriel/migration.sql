-- Renomeia agente Larissa → Gabriel (tenant config + catálogo).

ALTER TABLE "Tenant" RENAME COLUMN "larissaEnabled" TO "gabrielEnabled";
ALTER TABLE "Tenant" RENAME COLUMN "larissaModel" TO "gabrielModel";
ALTER TABLE "Tenant" RENAME COLUMN "larissaReplyDelayMs" TO "gabrielReplyDelayMs";

UPDATE "AiAgent"
SET key = 'larissa-legacy-migration'
WHERE key = 'larissa';

INSERT INTO "AiAgent" ("id", "key", "displayName", "description", "isActive", "createdAt", "updatedAt")
SELECT
  'gabriel-agent-seed',
  'gabriel',
  'Gabriel',
  COALESCE("description", 'Agente SDR de qualificação pós-disparo'),
  "isActive",
  "createdAt",
  NOW()
FROM "AiAgent"
WHERE "id" = 'larissa-agent-seed'
ON CONFLICT ("id") DO UPDATE SET
  key = EXCLUDED.key,
  "displayName" = EXCLUDED."displayName",
  description = EXCLUDED.description;

UPDATE "AiAgentSkill"
SET "agentId" = 'gabriel-agent-seed'
WHERE "agentId" = 'larissa-agent-seed';

UPDATE "Conversation"
SET "aiAgentId" = 'gabriel-agent-seed'
WHERE "aiAgentId" = 'larissa-agent-seed';

UPDATE "Message"
SET "aiAgentId" = 'gabriel-agent-seed'
WHERE "aiAgentId" = 'larissa-agent-seed';

UPDATE "AgentRun"
SET "agentId" = 'gabriel-agent-seed'
WHERE "agentId" = 'larissa-agent-seed';

DELETE FROM "AiAgent" WHERE "id" = 'larissa-agent-seed';
DELETE FROM "AiAgent" WHERE key = 'larissa-legacy-migration';
