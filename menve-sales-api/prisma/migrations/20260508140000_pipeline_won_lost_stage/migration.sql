-- AlterTable
ALTER TABLE "Pipeline" ADD COLUMN "wonStageId" TEXT,
ADD COLUMN "lostStageId" TEXT;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_wonStageId_fkey" FOREIGN KEY ("wonStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_lostStageId_fkey" FOREIGN KEY ("lostStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
