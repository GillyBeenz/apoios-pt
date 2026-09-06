import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { seedDeFontes } from "./seed-sql.ts";
import { FONTES } from "./registo.ts";

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const SEED = join(RAIZ, "supabase", "migrations", "0003_semear_fontes.sql");

/**
 * `funds.source_id` is `not null references sources (id)`, so a source missing from
 * this seed cannot ingest a single fund — and it fails as a foreign-key violation
 * deep inside a scheduled job, not anywhere a person is looking.
 *
 * Adding a source is therefore two edits, and the second is easy to forget. This
 * test makes forgetting it a failed build instead of a silent gap in the catalogue.
 */
describe("seed das fontes", () => {
  it("está em dia com o registo", () => {
    expect(readFileSync(SEED, "utf8")).toBe(seedDeFontes());
  });

  it("regista todas as fontes, activas ou em captura", () => {
    const sql = readFileSync(SEED, "utf8");
    for (const f of FONTES) {
      expect(sql, `${f.id} não está no seed`).toContain(`'${f.id}'`);
    }
  });

  it("marca activa apenas o que o pipeline ingere", () => {
    const sql = readFileSync(SEED, "utf8");
    for (const f of FONTES) {
      const linha = sql.split("\n").find((l) => l.includes(`('${f.id}'`));
      expect(linha, `${f.id} não está no seed`).toBeDefined();
      expect(linha, `activa de ${f.id} não espelha o estado`).toContain(
        `, ${f.estado === "activa"}, `,
      );
    }
  });
});
