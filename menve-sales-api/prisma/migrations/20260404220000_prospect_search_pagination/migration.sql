-- AlterTable
ALTER TABLE "ProspectSearch" ADD COLUMN "lastWebPageFetched" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProspectSearch" ADD COLUMN "webExhausted" BOOLEAN NOT NULL DEFAULT false;
