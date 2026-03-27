-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CONTACT', 'DEAL');

-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN "entity" "CustomFieldEntity" NOT NULL DEFAULT 'CONTACT';
ALTER TABLE "CustomField" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomField" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "customData" JSONB;

-- CreateIndex
CREATE INDEX "CustomField_tenantId_entity_sortOrder_idx" ON "CustomField"("tenantId", "entity", "sortOrder");
