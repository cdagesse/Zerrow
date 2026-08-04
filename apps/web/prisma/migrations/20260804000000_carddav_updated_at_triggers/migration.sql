-- CardDAV builds per-card etags and the collection ctag out of updatedAt on
-- Contact, Company and CompanyLabel. Prisma applies @updatedAt in the client,
-- not in the database, so a write that does not go through Prisma leaves the
-- timestamp untouched and every synced device is told nothing changed.
--
-- That is not hypothetical: a production backfill of Contact.companyId was
-- applied as raw SQL, the links changed, no updatedAt moved, and a phone
-- stopped fetching contacts entirely while the server looked healthy and
-- logged no errors. Diagnosing it took hours because every layer was behaving
-- correctly by its own rules.
--
-- Setting the column in a BEFORE UPDATE trigger makes change detection a
-- property of the table rather than of the code path that happened to do the
-- writing, so psql, a migration, a future script or an ORM swap all stay
-- visible to synced clients.
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- No recursion: BEFORE triggers mutate the row on its way to storage rather
  -- than issuing another UPDATE.
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prisma still sends its own updatedAt on every write; the trigger overwrites
-- it with the same intent (now()), so app behaviour is unchanged. The
-- WHEN guard keeps a no-op UPDATE (same values, e.g. an idempotent upsert)
-- from moving the timestamp and inventing a change for every device.
DROP TRIGGER IF EXISTS set_updated_at_on_contact ON "Contact";
CREATE TRIGGER set_updated_at_on_contact
BEFORE UPDATE ON "Contact"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_on_company ON "Company";
CREATE TRIGGER set_updated_at_on_company
BEFORE UPDATE ON "Company"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_on_company_label ON "CompanyLabel";
CREATE TRIGGER set_updated_at_on_company_label
BEFORE UPDATE ON "CompanyLabel"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION trg_set_updated_at();
