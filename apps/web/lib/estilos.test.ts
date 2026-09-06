import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(import.meta.dirname, "..");

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    if (nome === "node_modules" || nome === ".next") return [];
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    // Skip the tests themselves: this file has to name the bad pattern to explain it.
    if (/\.test\.tsx?$/.test(nome)) return [];
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/**
 * Tailwind 3 let you put a bare custom property in square brackets — `text-`
 * followed by `[`, `--color-suave`, `]` — and understood it as `var(...)`.
 * Tailwind 4 removed that. It now emits the property name as the literal value,
 * which is not valid CSS, so every browser drops the declaration and the element
 * silently renders in the inherited colour.
 *
 * Nothing warns. The build succeeds, the class is in the stylesheet, and the page
 * just looks slightly wrong — which is how 61 of these survived a whole phase of
 * work here, flattening every piece of muted text and every border in the app.
 *
 * The theme tokens generate real utilities (`text-suave`, `border-linha`), so
 * there is no reason to reach for the bracket form at all; the parenthesised form
 * remains available for a genuine one-off.
 *
 * The pattern is spelled out in prose rather than written literally anywhere in
 * this file, because Tailwind scans test sources too and would happily compile an
 * example in a comment into exactly the broken rule this test exists to forbid.
 */
describe("classes de tema", () => {
  const fontes = ficheiros(WEB);

  it("encontrou componentes para verificar", () => {
    expect(fontes.length).toBeGreaterThan(5);
  });

  it("não usa a forma `-[--var]`, que o Tailwind 4 compila para CSS inválido", () => {
    const maus: string[] = [];
    for (const f of fontes) {
      const linhas = readFileSync(f, "utf8").split("\n");
      for (const [i, linha] of linhas.entries()) {
        if (/-\[--[a-z]/.test(linha)) maus.push(`${f.slice(WEB.length + 1)}:${i + 1}`);
      }
    }
    expect(maus, `usar text-suave ou text-(--var):\n${maus.join("\n")}`).toEqual([]);
  });
});
