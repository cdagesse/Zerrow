-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "ignoredContactDomains" TEXT[] DEFAULT ARRAY[]::TEXT[];
