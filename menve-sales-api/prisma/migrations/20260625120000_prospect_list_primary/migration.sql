-- Lista principal única por workspace (capturas alimentam automaticamente).
ALTER TABLE "ProspectList" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "ProspectList_tenantId_code_key"
  ON "ProspectList"("tenantId", "code")
  WHERE "code" IS NOT NULL;
