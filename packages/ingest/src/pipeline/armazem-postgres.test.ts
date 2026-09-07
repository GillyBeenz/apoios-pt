import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizar } from "./armazem-postgres.ts";
import { problemaComLigacao } from "./ligacao.ts";

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
        for (const m of readFileSync(caminho, "utf8").matchAll(
          /process\.env\.([A-Z_]+)/g,
        )) {
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
 * and extractions succeeded, and an empty database.
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
    expect(antes, "ArmazemMemoria fora do ramo de simulação").toMatch(
      /if \(simulacao\)/,
    );
  });

  it("recusa correr sem credenciais em vez de descartar o trabalho", () => {
    expect(cli).toContain("DATABASE_URL");
    // A silent fallback here is the entire defect: it would look like success.
    expect(cli).toMatch(/throw new Error\(/);
    expect(cli).toContain("Falta DATABASE_URL");
  });

  it("o workflow passa tudo o que o código lê", () => {
    const lidas = new Set(
      [...cli.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]!),
    );
    expect(lidas.size).toBeGreaterThan(0);

    for (const v of lidas) {
      expect(
        workflow,
        `${v} é lida pelo código mas o workflow não a passa`,
      ).toContain(`${v}:`);
    }
  });

  it("o workflow não passa nada que ninguém leia", () => {
    // The reverse direction is what hid the gap: DATABASE_URL was once declared
    // as a secret and read by nothing, so the wiring looked complete from the
    // outside. Three Supabase credentials later replaced it and the same test
    // now guards the way back.
    const passadas = [...workflow.matchAll(/^ {6}([A-Z_]+):/gm)].map(
      (m) => m[1]!,
    );
    expect(passadas.length).toBeGreaterThan(0);

    for (const v of passadas) {
      if (CONSUMIDAS_POR_SDK[v] !== undefined) continue;
      expect(lidasNoRepo().has(v), `o workflow passa ${v} mas nada o lê`).toBe(
        true,
      );
    }
  });

  it("não deixa entrar a service_role nem as chaves que a substituíram", () => {
    // service_role bypasses RLS entirely and would read subscriber emails into a
    // public Actions log. The restricted role is the whole design, and the
    // PostgREST credentials that used to carry it are gone for good.
    expect(workflow).not.toMatch(/secrets\.[A-Z_]*SERVICE_ROLE/i);
    expect(workflow).not.toMatch(/SUPABASE_INGEST_KEY|SUPABASE_JWT_SECRET/);
    expect(cli).not.toMatch(/process\.env\.[A-Z_]*SERVICE_ROLE/i);
  });

  it("verifica o certificado do servidor", () => {
    // `sslmode=require` in a connection string means "encrypt" and says nothing
    // about trusting the peer. Turning verification off for a database holding
    // subscriber emails is not a trade worth making for a shorter setup.
    const armazem = semComentarios(
      ler("packages/ingest/src/pipeline/armazem-postgres.ts"),
    );
    expect(armazem).toMatch(/rejectUnauthorized:\s*true/);
    expect(armazem).not.toMatch(/rejectUnauthorized:\s*false/);
  });
});

/**
 * The guard that turns a wrong credential into a sentence instead of a stack
 * trace from inside the first source. Runs #5 to #10 were all this failure in
 * different disguises, and each cost a full workflow run to identify.
 */
describe("problemaComLigacao", () => {
  const boa =
    "postgresql://apoios_ingest.mlchfviehchzoolneibo:senha@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

  it("aceita o papel restrito, com e sem o sufixo do pooler", () => {
    expect(problemaComLigacao(boa)).toBeNull();
    expect(
      problemaComLigacao(
        "postgresql://apoios_ingest:senha@db.exemplo.co:5432/postgres",
      ),
    ).toBeNull();
  });

  it("recusa o utilizador postgres pelo nome", () => {
    const problema = problemaComLigacao(
      boa.replace("apoios_ingest", "postgres"),
    );
    expect(problema).toContain("dono do esquema");
    expect(problema).toContain("apoios_ingest");
  });

  it("nomeia o papel errado em vez de dizer só que falhou", () => {
    expect(problemaComLigacao(boa.replace("apoios_ingest", "anon"))).toContain(
      "`anon`",
    );
  });

  it("apanha um valor que não é sequer um URL", () => {
    expect(problemaComLigacao("sb_secret_algo")).toContain(
      "não é um URL válido",
    );
  });

  it("apanha o esquema errado", () => {
    expect(problemaComLigacao("https://exemplo.pt")).toContain("postgresql://");
  });

  it("aceita uma palavra-passe com caracteres codificados", () => {
    // `!` and `@` in a password are percent-encoded; decoding the username must
    // not be confused by them.
    expect(
      problemaComLigacao(
        "postgresql://apoios_ingest.ref:a%40b%21c@host.pooler.supabase.com:5432/postgres",
      ),
    ).toBeNull();
  });
});

describe("canonicalizar", () => {
  it("ignora o fragmento e a barra final", () => {
    expect(canonicalizar("https://x.pt/a/#frag")).toBe(
      canonicalizar("https://x.pt/a"),
    );
  });

  it("não confunde caminhos diferentes", () => {
    expect(canonicalizar("https://x.pt/a")).not.toBe(
      canonicalizar("https://x.pt/b"),
    );
  });

  it("devolve o original quando não é um URL", () => {
    expect(canonicalizar("nem-por-isso")).toBe("nem-por-isso");
  });
});
