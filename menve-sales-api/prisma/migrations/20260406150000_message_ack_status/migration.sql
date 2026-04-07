-- CreateEnum
CREATE TYPE "MessageAckStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "ackStatus" "MessageAckStatus";

-- Histórico: mensagens enviadas passam a exibir pelo menos "entregue" (dois cinzas).
UPDATE "Message" SET "ackStatus" = 'DELIVERED' WHERE "direction" = 'OUTBOUND' AND "ackStatus" IS NULL;
