-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "googleResourceName" TEXT,
ADD COLUMN "googleEtag" TEXT;

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "googleContactsSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "googleContactsSyncToken" TEXT,
ADD COLUMN "googleContactsSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Contact_emailAccountId_googleResourceName_idx" ON "Contact"("emailAccountId", "googleResourceName");
