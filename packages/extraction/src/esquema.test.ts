import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";

import { EsquemaExtraccao } from "./esquema.ts";
import { extraccaoParaApoio } from "./paraApoio.ts";
import { extraccaoSolar } from "./teste/extraccoes.ts";

const DECISAO = {
  needsReview: false,
  motivoRevisao: [] as string[],
  confiancaGlobal: "alta" as const,
  publicado: true,
  alertavel: true,
};
const CTX = {
  sourceId: "f",
  urlOficial: "https://x.pt/a",
  anoPredefinido: 2026,
};

/**
 * The constraint that stopped every extraction in execução #20.
 *
 *   400 invalid_request_error — Schemas contains too many parameters with union
 *   types (17 parameters with type arrays or anyOf) ... limit: 16
 *
 * The schema was one over, so no request reached the model at all. Nothing in
 * `esquema.ts` looks like it is near a limit, which is exactly why this is
 * measured here instead of remembered.
 */
describe("o esquema cabe no limite de uniões da API", () => {
  const { schema } = betaZodOutputFormat(EsquemaExtraccao);
  const json = JSON.stringify(schema);
  const unioes = (json.match(/"anyOf"/g) ?? []).length;

  it("fica com folga abaixo do limite de 16", () => {
    // Margin, not a pass mark: adding one `.nullable()` should fail here, in a
    // test that runs in three seconds, rather than in a paid run that rejects
    // every document.
    expect(unioes).toBeLessThanOrEqual(12);
  });

  it("mantém nulo o que não pode ser um sentinela", () => {
    // These five are the reason the fix was not simply "remove every nullable".
    // `0 €` is not "amount unknown" and `false` is not "we don't know whether the
    // budget ran out" — a sentinel here would turn an honest gap into a claim.
    const props = schema.properties as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    expect(JSON.stringify(props.dotacao_esgotada)).toContain("null");
    expect(JSON.stringify(props.dotacao)).toContain("null");
  });
});

/**
 * The other half: text absence is `""` in the schema, and must not survive as
 * `""` into storage. An empty string reaches the catalogue as a present-but-blank
 * field, which reads as "the notice says nothing here" rather than "we don't know".
 */
describe("a ausência textual volta a null na fronteira", () => {
  it("converte cadeias vazias em null", () => {
    const e = extraccaoSolar({
      identificacao: {
        titulo: "T",
        referencia_legal: {
          valor: "",
          confianca: "baixa",
          evidencia: "",
        },
        programa_pai: "",
        entidade_gestora: "",
        resumo_pt: "R",
      },
      candidatura: { url: "", plataforma: "" },
    });
    const a = extraccaoParaApoio(e, DECISAO, CTX);

    expect(a.programaPai).toBeNull();
    expect(a.entidadeGestora).toBeNull();
    expect(a.referenciaLegal).toBeNull();
    expect(a.urlCandidatura).toBeNull();
  });

  it("não confunde espaços em branco com conteúdo", () => {
    const e = extraccaoSolar({
      identificacao: {
        titulo: "T",
        referencia_legal: {
          valor: "",
          confianca: "baixa",
          evidencia: "",
        },
        programa_pai: "   ",
        entidade_gestora: "Fundo Ambiental",
        resumo_pt: "R",
      },
    });
    const a = extraccaoParaApoio(e, DECISAO, CTX);

    expect(a.programaPai).toBeNull();
    expect(a.entidadeGestora).toBe("Fundo Ambiental");
  });
});
