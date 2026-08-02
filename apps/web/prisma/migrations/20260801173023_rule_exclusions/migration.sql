-- CreateTable
CREATE TABLE "_RuleExclusions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RuleExclusions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RuleExclusions_B_index" ON "_RuleExclusions"("B");

-- AddForeignKey
ALTER TABLE "_RuleExclusions" ADD CONSTRAINT "_RuleExclusions_A_fkey" FOREIGN KEY ("A") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RuleExclusions" ADD CONSTRAINT "_RuleExclusions_B_fkey" FOREIGN KEY ("B") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
