-- CreateEnum
CREATE TYPE "ProspectSource" AS ENUM ('GOOGLE_SEARCH', 'GOOGLE_MAPS');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "ProspectSearch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" TEXT,
    "webCount" INTEGER NOT NULL DEFAULT 0,
    "mapsCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "source" "ProspectSource" NOT NULL,
    "position" INTEGER,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "address" TEXT,
    "snippet" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "googleMapsUrl" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "enrichmentData" JSONB,
    "enrichedAt" TIMESTAMP(3),
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectSearch_tenantId_createdAt_idx" ON "ProspectSearch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectResult_tenantId_searchId_idx" ON "ProspectResult"("tenantId", "searchId");

-- CreateIndex
CREATE INDEX "ProspectResult_tenantId_status_idx" ON "ProspectResult"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProspectResult_searchId_enrichedAt_idx" ON "ProspectResult"("searchId", "enrichedAt");

-- AddForeignKey
ALTER TABLE "ProspectSearch" ADD CONSTRAINT "ProspectSearch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectSearch" ADD CONSTRAINT "ProspectSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectResult" ADD CONSTRAINT "ProspectResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectResult" ADD CONSTRAINT "ProspectResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "ProspectSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectResult" ADD CONSTRAINT "ProspectResult_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
