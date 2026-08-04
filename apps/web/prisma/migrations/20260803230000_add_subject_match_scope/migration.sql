-- A subject condition matches replies and originals alike: reply prefixes are
-- stripped from both the pattern and the subject so "Daily Report" still
-- catches "Re: Daily Report". That is right for a rule describing a topic and
-- wrong when the user means only the reply, or only the opening message --
-- there was no way to say either, so a reply landing on the original's rule
-- looked like a misroute with no setting to correct it.
CREATE TYPE "SubjectMatchScope" AS ENUM ('ANY', 'REPLIES', 'ORIGINALS');

ALTER TABLE "Rule"
  ADD COLUMN "subjectMatchScope" "SubjectMatchScope" NOT NULL DEFAULT 'ANY';

-- Snapshotted as TEXT, matching how conditionalOperator, systemType and
-- subjectMatchMode are already stored here. Without it a scope-only edit
-- writes a version byte-identical to the previous one and disappears from
-- rule history.
ALTER TABLE "RuleHistory"
  ADD COLUMN "subjectMatchScope" TEXT NOT NULL DEFAULT 'ANY';

-- The trigger names an explicit column list, so it must be dropped and
-- recreated rather than altered. Omitting the new column would leave
-- EmailAccount.rulesRevision untouched when the scope changes, and the
-- assistant chat would keep answering from the pre-change snapshot for the
-- rest of the conversation.
DROP TRIGGER IF EXISTS bump_rules_revision_from_rule ON "Rule";

CREATE TRIGGER bump_rules_revision_from_rule
AFTER INSERT OR DELETE OR UPDATE OF
  name,
  enabled,
  "runOnThreads",
  "conditionalOperator",
  instructions,
  "groupId",
  "from",
  "fromExclude",
  "to",
  "toExclude",
  subject,
  "subjectMatchMode",
  "subjectMatchScope",
  "subjectExclude",
  body,
  "excludeKnownContacts",
  "systemType",
  "promptText"
ON "Rule"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_rule();
