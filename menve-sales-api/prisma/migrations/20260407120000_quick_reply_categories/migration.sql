-- CreateTable
CREATE TABLE "QuickReplyCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickReplyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickReplyCategory_tenantId_sortOrder_idx" ON "QuickReplyCategory"("tenantId", "sortOrder");

-- AddForeignKey
ALTER TABLE "QuickReplyCategory" ADD CONSTRAINT "QuickReplyCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "QuickReply" ADD COLUMN "categoryId" TEXT;

-- Uma categoria "Geral" por tenant que já tinha respostas rápidas
INSERT INTO "QuickReplyCategory" ("id", "tenantId", "name", "sortOrder", "createdAt")
SELECT
    'qrt_mig_' || "tenantId",
    "tenantId",
    'Geral',
    0,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId" FROM "QuickReply") AS t;

UPDATE "QuickReply" AS qr
SET "categoryId" = qc."id"
FROM "QuickReplyCategory" AS qc
WHERE qc."tenantId" = qr."tenantId"
  AND qc."name" = 'Geral'
  AND qc."id" LIKE 'qrt_mig_%';

ALTER TABLE "QuickReply" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuickReplyCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "QuickReply_categoryId_sortOrder_idx" ON "QuickReply"("categoryId", "sortOrder");
