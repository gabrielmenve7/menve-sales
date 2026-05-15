-- CreateEnum
CREATE TYPE "StageLifecycle" AS ENUM ('NOT_STARTED', 'ACTIVE', 'DONE', 'CLOSED');

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN "lifecycle" "StageLifecycle" NOT NULL DEFAULT 'ACTIVE';

-- Etapa de ganho/perda: categorias padrão para o ícone e filtros
UPDATE "Stage" s
SET "lifecycle" = 'CLOSED'
FROM "Pipeline" p
WHERE p."wonStageId" = s.id;

UPDATE "Stage" s
SET "lifecycle" = 'DONE'
FROM "Pipeline" p
WHERE p."lostStageId" = s.id;
