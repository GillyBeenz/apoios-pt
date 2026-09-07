import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assinarTokenIngestao } from "./assinar-token.ts";
import { problemaComToken } from "./token-ingestao.ts";

const SEGREDO = "segredo-de-teste-que-nao-e-o-do-projecto";
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

function corpoDe(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

/** Recomputed independently of the implementation, from the token's own halves. */
function assinaturaConfere(token: string, segredo: string): boolean {
  const [cabecalho, corpo, assinatura] = token.split(".");
  const esperada = createHmac("sha256", segredo)
    .update(`${cabecalho}.${corpo}`)
    .digest("base64url");
  return assinatura === esperada;
}

describe("assinar o token de ingestão", () => {
  it("produz algo que a guarda aceita", () => {
    // The guard is what rejected runs #6, #7 and #8. A derived token has to pass
    // it, or the derivation is not a way out of anything.
    expect(problemaComToken(assinarTokenIngestao(SEGREDO))).toBeNull();
  });

  it("parece um JWT, incluindo o prefixo que o distingue de um segredo", () => {
    const token = assinarTokenIngestao(SEGREDO);
    expect(token.split(".")).toHaveLength(3);
    // `eyJ` is base64 of `{"`. No random secret starts that way; every JWT does.
    expect(token.startsWith("eyJ")).toBe(true);
  });

  it("pede o papel restrito e nunca a service_role", () => {
    expect(corpoDe(assinarTokenIngestao(SEGREDO))["role"]).toBe("apoios_ingest");
  });

  it("expira em minutos, não em anos", () => {
    // The point of signing per run: a leaked token dies on its own. The pasted
    // one this replaces was good for two years.
    const exp = corpoDe(assinarTokenIngestao(SEGREDO))["exp"] as number;
    const vida = exp - Math.floor(Date.now() / 1000);
    expect(vida).toBeGreaterThan(0);
    expect(vida).toBeLessThanOrEqual(15 * 60);
  });

  it("assina com o segredo dado", () => {
    const token = assinarTokenIngestao(SEGREDO);
    expect(assinaturaConfere(token, SEGREDO)).toBe(true);
    expect(assinaturaConfere(token, `${SEGREDO}-outro`)).toBe(false);
  });

  it("não deixa o segredo passar para o token", () => {
    expect(assinarTokenIngestao(SEGREDO)).not.toContain(SEGREDO);
    expect(Buffer.from(assinarTokenIngestao(SEGREDO)).toString()).not.toContain(SEGREDO);
  });
});

/**
 * The script and the module sign the same thing in two places, so they can drift.
 * This pins them together without coupling them: the script's output is verified
 * against the same secret, by the same independent recomputation.
 */
describe("o script manual continua a produzir um token válido", () => {
  const saida = execFileSync("node", [join(RAIZ, "scripts", "assinar-token-ingestao.mjs")], {
    env: { ...process.env, SUPABASE_JWT_SECRET: SEGREDO },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  it("escreve só o token no stdout", () => {
    expect(saida.split("\n")).toHaveLength(1);
    expect(problemaComToken(saida)).toBeNull();
  });

  it("assina do mesmo modo que o módulo", () => {
    expect(assinaturaConfere(saida, SEGREDO)).toBe(true);
    expect(corpoDe(saida)["role"]).toBe(corpoDe(assinarTokenIngestao(SEGREDO))["role"]);
  });
});
