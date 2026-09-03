import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const WORKFLOWS = join(RAIZ, ".github", "workflows");

/**
 * The pnpm version must be declared in exactly one place.
 *
 * It is in `packageManager` in the root package.json, because Vercel reads that and
 * cannot read a workflow file. pnpm/action-setup then refuses to run if the workflow
 * ALSO passes `version:` — "Multiple versions of pnpm specified" — which took every
 * workflow in this repo down at once the first time the field was added.
 *
 * A comment saying "don't add version:" would not have caught it. This does.
 */
describe("workflows", () => {
  const ficheiros = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

  it("declara o pnpm apenas no packageManager", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);

    for (const f of ficheiros) {
      const texto = readFileSync(join(WORKFLOWS, f), "utf8");
      const linhas = texto.split("\n");
      for (const [i, linha] of linhas.entries()) {
        if (!linha.includes("pnpm/action-setup")) continue;
        // Look at the step's `with:` block — anything up to the next step.
        const resto = linhas.slice(i + 1, i + 8).join("\n").split(/\n\s*- /)[0] ?? "";
        expect(resto, `${f}:${i + 1} passa version: ao pnpm/action-setup`).not.toMatch(
          /^\s*version:/m,
        );
      }
    }
  });

  it("encontrou workflows para verificar", () => {
    // Guards against the test passing vacuously if the directory ever moves.
    expect(ficheiros.length).toBeGreaterThanOrEqual(3);
    expect(ficheiros.some((f) => f.includes("capturar-fixtures"))).toBe(true);
  });
});
