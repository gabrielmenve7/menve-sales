-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SELLER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastActiveTenantId" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_userId_tenantId_key" ON "WorkspaceMembership"("userId", "tenantId");

CREATE INDEX "WorkspaceMembership_tenantId_idx" ON "WorkspaceMembership"("tenantId");

CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");

CREATE INDEX "WorkspaceInvite_tenantId_emailNormalized_idx" ON "WorkspaceInvite"("tenantId", "emailNormalized");

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill memberships from legacy User.tenantId (idempotente)
INSERT INTO "WorkspaceMembership" ("id", "userId", "tenantId", "role", "joinedAt", "createdAt", "updatedAt")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || u.id), 1, 25),
  u.id,
  u."tenantId",
  CASE u."role"::text
    WHEN 'OWNER' THEN 'OWNER'::"WorkspaceRole"
    WHEN 'ADMIN' THEN 'ADMIN'::"WorkspaceRole"
    WHEN 'MANAGER' THEN 'MANAGER'::"WorkspaceRole"
    WHEN 'SELLER' THEN 'SELLER'::"WorkspaceRole"
    WHEN 'SUPER_ADMIN' THEN 'OWNER'::"WorkspaceRole"
    ELSE 'SELLER'::"WorkspaceRole"
  END,
  NOW(),
  NOW(),
  NOW()
FROM "User" u
WHERE u."tenantId" IS NOT NULL
ON CONFLICT ("userId", "tenantId") DO NOTHING;
