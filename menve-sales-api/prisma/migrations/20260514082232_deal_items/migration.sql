-- CreateTable
CREATE TABLE "DealItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealItem_tenantId_dealId_idx" ON "DealItem"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "DealItem_productId_idx" ON "DealItem"("productId");

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
