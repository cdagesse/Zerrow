-- CreateTable
CREATE TABLE "CompanyLabel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CompanyLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "labelId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "title" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "aiSummary" TEXT,
ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "useCompanyLogo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "companyId" TEXT;

-- Migrate the old free-text company field into Company rows
INSERT INTO "Company" ("id", "createdAt", "updatedAt", "name", "emailAccountId")
SELECT
    'cmp_' || md5("emailAccountId" || '|' || "company"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    "company",
    "emailAccountId"
FROM "Contact"
WHERE "company" IS NOT NULL AND "company" <> ''
GROUP BY "emailAccountId", "company";

UPDATE "Contact" c
SET "companyId" = 'cmp_' || md5(c."emailAccountId" || '|' || c."company")
WHERE c."company" IS NOT NULL AND c."company" <> '';

ALTER TABLE "Contact" DROP COLUMN "company";

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLabel_emailAccountId_name_key" ON "CompanyLabel"("emailAccountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_emailAccountId_name_key" ON "Company"("emailAccountId", "name");

-- AddForeignKey
ALTER TABLE "CompanyLabel" ADD CONSTRAINT "CompanyLabel_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CompanyLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLabel" ADD CONSTRAINT "CompanyLabel_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "CompanyLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
