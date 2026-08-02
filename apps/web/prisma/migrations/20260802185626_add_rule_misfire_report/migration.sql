-- CreateEnum
CREATE TYPE "MisfireReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "RuleMisfireReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT,
    "actualRuleId" TEXT,
    "expectedRuleId" TEXT,
    "explanation" JSONB,
    "suspectedBug" BOOLEAN NOT NULL DEFAULT false,
    "status" "MisfireReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewNote" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "RuleMisfireReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleMisfireReport_status_suspectedBug_idx" ON "RuleMisfireReport"("status", "suspectedBug");

-- CreateIndex
CREATE INDEX "RuleMisfireReport_emailAccountId_idx" ON "RuleMisfireReport"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleMisfireReport_emailAccountId_messageId_key" ON "RuleMisfireReport"("emailAccountId", "messageId");

-- AddForeignKey
ALTER TABLE "RuleMisfireReport" ADD CONSTRAINT "RuleMisfireReport_actualRuleId_fkey" FOREIGN KEY ("actualRuleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMisfireReport" ADD CONSTRAINT "RuleMisfireReport_expectedRuleId_fkey" FOREIGN KEY ("expectedRuleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMisfireReport" ADD CONSTRAINT "RuleMisfireReport_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ClassificationFeedback_emailAccountId_sender_ruleId_messageId_e" RENAME TO "ClassificationFeedback_emailAccountId_sender_ruleId_message_key";

-- RenameIndex
ALTER INDEX "DraftSendLog_replyMemoryProcessedAt_replyMemoryAttemptCount_cre" RENAME TO "DraftSendLog_replyMemoryProcessedAt_replyMemoryAttemptCount_idx";

-- RenameIndex
ALTER INDEX "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_content_ke" RENAME TO "ReplyMemory_emailAccountId_kind_scopeType_scopeValue_conten_key";

-- RenameIndex
ALTER INDEX "ReplyMemorySource_replyMemoryId_learnedWritingStyleAnalyzedAt_c" RENAME TO "ReplyMemorySource_replyMemoryId_learnedWritingStyleAnalyzed_idx";
