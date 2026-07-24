-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "carddavPasswordHash" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "carddavUid" TEXT;
