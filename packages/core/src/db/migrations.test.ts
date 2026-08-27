import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "./migrator.js";
import { formatSchemaDrift, isDriftFree, type SchemaDrift } from "./schema-check.js";

const folder = migrationsFolder();

interface Journal {
  entries: { idx: number; tag: string }[];
}

function journal(): Journal {
  return JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as Journal;
}

describe("migrations folder", () => {
  it("has a journal entry for every SQL file and vice versa", () => {
    // A migration committed without its journal entry never runs; a journal
    // entry without its file makes every boot fail. Both are easy to do by
    // hand-resolving a merge conflict, and neither shows up until deploy.
    const files = readdirSync(folder)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    const tags = journal().entries.map((e) => e.tag).sort();
    expect(tags).toEqual(files);
  });

  it("numbers migrations contiguously from zero", () => {
    const indexes = journal().entries.map((e) => e.idx);
    expect(indexes).toEqual(indexes.map((_, i) => i));
  });

  it("keeps the baseline idempotent so it can adopt a pre-migration database", () => {
    // 0000 is the one migration that may land on a database whose tables the
    // old boot-time DDL already created. Everything it creates must tolerate
    // already being there.
    const sql = readFileSync(join(folder, "0000_baseline.sql"), "utf8");
    const creates = sql.match(/^CREATE (?:UNIQUE )?(?:TABLE|INDEX)[^;]*/gm) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const statement of creates) {
      expect(statement, statement.slice(0, 60)).toContain("IF NOT EXISTS");
    }
    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, so FKs are guarded instead.
    for (const line of sql.split("\n").filter((l) => l.includes("ADD CONSTRAINT"))) {
      expect(sql).toContain("EXCEPTION WHEN duplicate_object THEN NULL;");
      expect(line).toContain("ALTER TABLE");
    }
  });

  it("only writes the baseline idempotently — later migrations run exactly once", () => {
    for (const file of readdirSync(folder).filter((f) => f.endsWith(".sql"))) {
      if (file === "0000_baseline.sql") continue;
      expect(readFileSync(join(folder, file), "utf8"), file).not.toContain("IF NOT EXISTS");
    }
  });
});

describe("schema drift reporting", () => {
  const empty: SchemaDrift = { missingTables: [], missingColumns: [], wrongTypes: [] };

  it("reports nothing when the schema is in step", () => {
    expect(isDriftFree(empty)).toBe(true);
    expect(formatSchemaDrift(empty)).toBeNull();
  });

  it("names the missing column and the command that fixes it", () => {
    // This is the message that would have replaced a 502 with a diagnosis when
    // `externalId: true` was added to an already-shipped entity.
    const report = formatSchemaDrift({
      ...empty,
      missingColumns: [{ table: "comment", column: "external_id", type: "TEXT" }],
    });
    expect(report).toContain("comment.external_id (TEXT)");
    expect(report).toContain("pnpm db:generate");
  });

  it("reports missing tables and wrong types", () => {
    const report = formatSchemaDrift({
      missingTables: ["invoice"],
      missingColumns: [],
      wrongTypes: [{ table: "deal", column: "value", expected: "numeric", actual: "integer" }],
    });
    expect(report).toContain("invoice");
    expect(report).toContain("deal.value is integer, expected numeric");
    expect(isDriftFree({ missingTables: ["invoice"], missingColumns: [], wrongTypes: [] })).toBe(false);
  });
});
