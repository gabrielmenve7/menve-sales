-- CreateEnum
CREATE TYPE "ProspectSearchStatus" AS ENUM ('RUNNING', 'ENRICHING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "ProspectSearch" ADD COLUMN     "segment" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "engines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" "ProspectSearchStatus" NOT NULL DEFAULT 'DONE',
ADD COLUMN     "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorMessage" TEXT;

-- Backfill legacy searches: treat existing rows as completed captures
UPDATE "ProspectSearch"
SET
  "segment" = "query",
  "status" = 'DONE',
  "qualifiedCount" = (
    SELECT COUNT(*)::int
    FROM "ProspectResult" pr
    WHERE pr."searchId" = "ProspectSearch"."id" AND pr."hasWebsite" = true
  )
WHERE "segment" IS NULL;
