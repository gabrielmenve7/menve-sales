-- CreateTable
CREATE TABLE "DashboardBoard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardBoard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardBoard_tenantId_userId_idx" ON "DashboardBoard"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "DashboardBoard" ADD CONSTRAINT "DashboardBoard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardBoard" ADD CONSTRAINT "DashboardBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
