import { readFileSync } from "node:fs";
import { join } from "node:path";

interface EntradaDoManifesto {
  readonly url: string;
  readonly ficheiro: string;
}

/**
 * Resolves a captured fixture through `manifest.json` instead of by file name.
 *
 * The capture workflow names each file after the URL it came from plus a content
 * hash, so a source that republishes its spreadsheet renames the fixture. A test
 * that spells the old name out then fails with ENOENT and says nothing about the
 * code it covers — which is exactly how two tests here went red on `main` when the
 * PT2030 annual plan moved from `...052026-b402e08542.xlsx` to
 * `...140926-1-e31177726c.xlsx`. The URL is the stable identity; the file name is
 * an implementation detail of the capture.
 *
 * Throws when the pattern does not match exactly one entry, so an ambiguous or
 * missing capture fails loudly rather than silently testing the wrong file.
 */
export function ficheiroDaFixture(dir: string, padraoUrl: RegExp): string {
  const manifesto = JSON.parse(
    readFileSync(join(dir, "manifest.json"), "utf8"),
  ) as { entradas: readonly EntradaDoManifesto[] };

  const encontradas = manifesto.entradas.filter((e) => padraoUrl.test(e.url));
  if (encontradas.length !== 1) {
    throw new Error(
      `${dir}: ${String(padraoUrl)} corresponde a ${encontradas.length} ` +
        `entradas do manifesto, esperava exactamente 1`,
    );
  }
  return join(dir, encontradas[0]!.ficheiro);
}
