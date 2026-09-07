import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizar, deHexPostgres, paraHexPostgres } from "./armazem-supabase.ts";

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const ler = (rel: string): string => readFileSync(join(RAIZ, rel), "utf8");

/**
 * Comments describe the defect, so they mention the very things these tests
 * forbid. Stripping them first is the difference between checking the code and
 * checking the prose about the code.
 */
function semComentarios(ts: string): string {
  return ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function yamlSemComentarios(y: string): string {
  return y.replace(/^\s*#.*$/gm, "");
}

/**
 * Variables no source file mentions because a dependency reads them itself.
 * Listed explicitly so "nothing reads it" stays a real finding rather than a
 * standing exception.
 */
const CONSUMIDAS_POR_SDK: Record<string, string> = {
  ANTHROPIC_API_KEY: "lida pelo SDK da Anthropic",
};

/** Every `process.env.X` in the workspace's own sources. */
function lidasNoRepo(): Set<string> {
  const nomes = new Set<string>();

  const percorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === "node_modules" || entrada.name === ".next") continue;
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        percorrer(caminho);
      } else if (/\.tsx?$/.test(entrada.name)) {
        for (const m of readFileSync(caminho, "utf8").matchAll(/process\.env\.([A-Z_]+)/g)) {
          nomes.add(m[1]!);
        }
      }
    }
  };

  percorrer(join(RAIZ, "packages"));
  percorrer(join(RAIZ, "apps"));
  return nomes;
}

/**
 * The bug this file exists for.
 *
 * `cli.ts` built an `ArmazemMemoria` unconditionally, including on the scheduled
 * run. Ingestion fetched every source, paid the model to extract each notice,
 * wrote the results into a Map and exited green — a log full of candidates found
 * and extractions succeeded, and an empty database. `DATABASE_URL` was handed to
 * the job as a secret and read by nothing at all.
 *
 * Nothing failed, so nothing reported it. These are the assertions that would
 * have caught it.
 */
describe("a ingestão escreve mesmo", () => {
  const cli = semComentarios(ler("packages/ingest/src/cli.ts"));
  const workflow = yamlSemComentarios(ler(".github/workflows/ingerir.yml"));

  it("só constrói o armazém de memória dentro do ramo de simulação", () => {
    const construcoes = [...cli.matchAll(/new ArmazemMemoria\(\)/g)];
    expect(construcoes.length).toBe(1);

    const antes = cli.slice(0, construcoes[0]!.index);
    expect(antes, "ArmazemMemoria fora do ramo de simulação").toMatch(/if \(simulacao\)/);
  });

  it("recusa correr sem credenciais em vez de descartar o trabalho", () => {
    expect(cli).toContain("SUPABASE_INGEST_KEY");
    // A silent fallback here is the entire defect: it would look like success.
    expect(cli).toMatch(/throw new Error\(/);
    expect(cli).toContain("Faltam credenciais");
  });

  it("o workflow passa tudo o que o código lê", () => {
    const lidas = new Set([...cli.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]!));
    expect(lidas.size).toBeGreaterThan(0);

    for (const v of lidas) {
      expect(workflow, `${v} é lida pelo código mas o workflow não a passa`).toContain(`${v}:`);
    }
  });

  it("o workflow não passa nada que ninguém leia", () => {
    // The reverse direction is what hid the gap: DATABASE_URL was declared as a
    // secret and read by nothing, so the wiring looked complete from the outside.
    const passadas = [...workflow.matchAll(/^ {6}([A-Z_]+):/gm)].map((m) => m[1]!);
    expect(passadas.length).toBeGreaterThan(0);

    for (const v of passadas) {
      const razao = CONSUMIDAS_POR_SDK[v];
      if (razao !== undefined) continue;
      expect(lidasNoRepo().has(v), `o workflow passa ${v} mas nada o lê`).toBe(true);
    }
  });

  /**
   * The two credentials are not interchangeable, and getting it wrong produces a
   * bare 401 "Invalid API key" that names neither header.
   *
   * Supabase's API gateway validates `apikey` against the keys the project
   * actually issued, before PostgREST is reached. A self-signed JWT is not one
   * of them. So the publishable key goes in `apikey` (via createClient's second
   * argument) and the ingestion JWT goes in `Authorization` (via accessToken).
   * Passing the JWT as both — `createClient(url, token)` — is what failed run #5.
   */
  it("separa a chave do gateway do token do papel", () => {
    const armazem = semComentarios(
      ler("packages/ingest/src/pipeline/armazem-supabase.ts"),
    );

    // The publishable key is the client's second argument: the `apikey` header.
    expect(armazem).toMatch(/createClient\(\s*url,\s*chavePublicavel/);
    // The role token rides in Authorization, which is what accessToken sets.
    expect(armazem).toMatch(/accessToken:\s*async\s*\(\)\s*=>\s*tokenIngestao/);
    // And never the other way round.
    expect(armazem).not.toMatch(/createClient\(\s*url,\s*tokenIngestao/);
  });

  it("exige as três variáveis, nomeando as que faltam", () => {
    for (const v of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_INGEST_KEY"]) {
      expect(cli, `${v} não é exigida`).toContain(v);
    }
  });

  it("não usa a service_role", () => {
    // service_role bypasses RLS entirely and would read subscriber emails into a
    // public Actions log. The restricted role is the whole design.
    expect(workflow).not.toMatch(/secrets\.[A-Z_]*SERVICE_ROLE/i);
    expect(cli).not.toMatch(/process\.env\.[A-Z_]*SERVICE_ROLE/i);
  });
});

describe("bytea sobre o PostgREST", () => {
  it("dá a volta sem perder bytes", () => {
    const original = new TextEncoder().encode("Aviso 03/C13-i01/2024 — 15.000 €");
    expect(deHexPostgres(paraHexPostgres(original))).toEqual(original);
  });

  it("usa o formato hex do Postgres", () => {
    expect(paraHexPostgres(new Uint8Array([0, 15, 255]))).toBe("\\x000fff");
  });

  it("lê de volta com ou sem o prefixo", () => {
    expect(deHexPostgres("\\x414243")).toEqual(new Uint8Array([65, 66, 67]));
    expect(deHexPostgres("414243")).toEqual(new Uint8Array([65, 66, 67]));
  });

  it("aguenta um corpo binário com zeros", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x00, 0xff]);
    expect(deHexPostgres(paraHexPostgres(pdf))).toEqual(pdf);
  });
});

describe("canonicalizar", () => {
  it("ignora o fragmento e a barra final", () => {
    expect(canonicalizar("https://x.pt/a/#frag")).toBe(canonicalizar("https://x.pt/a"));
  });

  it("não confunde caminhos diferentes", () => {
    expect(canonicalizar("https://x.pt/a")).not.toBe(canonicalizar("https://x.pt/b"));
  });

  it("devolve o original quando não é um URL", () => {
    expect(canonicalizar("nem-por-isso")).toBe("nem-por-isso");
  });
});
