import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CardDAV etags and the collection ctag are derived from `updatedAt` on every
 * model `addressbookState` reads. Prisma applies `@updatedAt` in the client, so
 * any write that does not go through Prisma leaves the timestamp untouched and
 * synced devices are told nothing changed.
 *
 * A production backfill applied as raw SQL did exactly that: the rows changed,
 * no `updatedAt` moved, and a phone stopped fetching contacts while the server
 * looked healthy. The database triggers exist so change detection is a property
 * of the table rather than of whichever code path did the writing.
 *
 * This test fails when a new model joins the ctag material without one.
 */

const PRISMA_DIR = path.join(process.cwd(), "prisma");
const HANDLER = path.join(process.cwd(), "utils", "carddav", "handler.ts");

describe("CardDAV updatedAt triggers", () => {
  it("covers every model the addressbook ctag is built from", () => {
    const covered = getTablesWithUpdatedAtTrigger();
    const missing = getCtagTables().filter((table) => !covered.includes(table));

    expect(missing).toEqual([]);
  });

  it("only fires when the row actually changed", () => {
    // Without the guard an idempotent UPDATE would move updatedAt and invent a
    // change for every synced device on every no-op write.
    const sql = readMigrations();
    const triggerBlocks = sql.match(
      /CREATE TRIGGER set_updated_at_on_[\s\S]*?EXECUTE FUNCTION trg_set_updated_at\(\);/g,
    );

    expect(triggerBlocks?.length).toBeGreaterThan(0);
    for (const block of triggerBlocks ?? []) {
      expect(block).toContain("BEFORE UPDATE");
      expect(block).toContain("OLD.* IS DISTINCT FROM NEW.*");
    }
  });
});

function readMigrations(): string {
  return readdirSync(path.join(PRISMA_DIR, "migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      readFileSync(
        path.join(PRISMA_DIR, "migrations", entry.name, "migration.sql"),
        "utf8",
      ),
    )
    .join("\n");
}

function getTablesWithUpdatedAtTrigger(): string[] {
  const sql = readMigrations();
  return [
    ...sql.matchAll(
      /CREATE TRIGGER set_updated_at_on_\w+\s+BEFORE UPDATE ON "(\w+)"/g,
    ),
  ].map((match) => match[1]);
}

// The models addressbookState queries, read from the source rather than
// restated here, so folding a fourth model into the ctag surfaces immediately.
function getCtagTables(): string[] {
  const handler = readFileSync(HANDLER, "utf8");
  const start = handler.indexOf("async function addressbookState");
  expect(start).toBeGreaterThan(-1);
  const body = handler.slice(start, handler.indexOf("\n}", start));

  const models = new Set(
    [...body.matchAll(/prisma\.(\w+)\./g)].map((match) => match[1]),
  );
  return [...models].map(
    (model) => model.charAt(0).toUpperCase() + model.slice(1),
  );
}
