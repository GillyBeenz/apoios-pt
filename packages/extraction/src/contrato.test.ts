import { describe, expect, it } from "vitest";

import {
  CONTRATO_JSON,
  apararDemasiadoLongos,
  extrairJson,
} from "./contrato.ts";
import { EsquemaExtraccao } from "./esquema.ts";
import { extraccaoSolar } from "./teste/extraccoes.ts";

/**
 * The decoder no longer guarantees the shape, so these are the assertions that
 * replace it. Execução #22 rejected the schema outright — *"The compiled grammar
 * is too large"* — and the only cuts left were `confianca` and `evidencia`, which
 * are the hallucination gate. So the grammar went, and validation moved here.
 */
describe("o contrato que substitui a descodificação restrita", () => {
  it("descreve o esquema real, não uma cópia escrita à mão", () => {
    // Generated from EsquemaExtraccao, so instruction and validator cannot drift.
    expect(CONTRATO_JSON).toContain("admite_particulares");
    expect(CONTRATO_JSON).toContain("dotacao_esgotada");
    expect(CONTRATO_JSON).toContain("schema_version");
  });

  it("diz as regras que o esquema não exprime", () => {
    // The two sentinel conventions are invisible in JSON Schema — a `string` says
    // nothing about `""` meaning absent — so they have to be stated in prose.
    expect(CONTRATO_JSON).toContain('`""`');
    expect(CONTRATO_JSON).toContain("`null`");
  });
});

describe("extrairJson", () => {
  const objecto = { a: 1, b: { c: "x" } };

  it("lê JSON simples", () => {
    expect(extrairJson(JSON.stringify(objecto))).toEqual(objecto);
  });

  it("aguenta uma cerca de código", () => {
    expect(
      extrairJson("```json\n" + JSON.stringify(objecto) + "\n```"),
    ).toEqual(objecto);
  });

  it("aguenta uma frase antes e depois", () => {
    const t = `Aqui está a extracção:\n${JSON.stringify(objecto)}\nEspero que ajude.`;
    expect(extrairJson(t)).toEqual(objecto);
  });

  it("devolve null em JSON truncado, em vez de o remendar", () => {
    // A truncated object must fail loudly. Repairing it here would invent values
    // for fields the document never supported — the exact failure this pipeline
    // is built to avoid.
    expect(extrairJson('{"a": 1, "b": {"c":')).toBeNull();
  });

  it("devolve null quando não há objecto nenhum", () => {
    expect(extrairJson("Não consegui interpretar este documento.")).toBeNull();
  });
});

describe("a validação continua a ser o esquema", () => {
  it("aceita uma extracção bem formada", () => {
    const bruto = JSON.parse(JSON.stringify(extraccaoSolar()));
    expect(EsquemaExtraccao.safeParse(bruto).success).toBe(true);
  });

  it("rejeita um enum inventado", () => {
    const bruto = JSON.parse(JSON.stringify(extraccaoSolar()));
    bruto.beneficiarios.admite_particulares.valor = "talvez";
    const r = EsquemaExtraccao.safeParse(bruto);
    expect(r.success).toBe(false);
  });

  it("rejeita um campo em falta", () => {
    const bruto = JSON.parse(JSON.stringify(extraccaoSolar()));
    delete bruto.estado;
    expect(EsquemaExtraccao.safeParse(bruto).success).toBe(false);
  });

  it("rejeita null onde o contrato pede texto", () => {
    const bruto = JSON.parse(JSON.stringify(extraccaoSolar()));
    bruto.identificacao.programa_pai = null;
    expect(EsquemaExtraccao.safeParse(bruto).success).toBe(false);
  });
});

describe("apararDemasiadoLongos", () => {
  // Os caminhos e limites são os que a execução #24 reportou, tal e qual.
  const problemaResumo = {
    code: "too_big",
    origin: "string",
    maximum: 600,
    path: ["identificacao", "resumo_pt"],
  };

  it("apara um resumo comprido em vez de deitar fora a extracção", () => {
    const json = { identificacao: { resumo_pt: "a".repeat(620) } };
    const { json: saida, aparados } = apararDemasiadoLongos(json, [
      problemaResumo,
    ]);
    expect(aparados).toEqual(["identificacao.resumo_pt"]);
    expect(
      (saida as { identificacao: { resumo_pt: string } }).identificacao
        .resumo_pt,
    ).toHaveLength(600);
  });

  it("apara uma citação, e o que sobra continua a ser um prefixo do que o modelo escreveu", () => {
    const citacao = `${"O documento afirma que ".repeat(20)}FIM`;
    const json = { beneficiarios: { tipos: { evidencia: citacao } } };
    const { json: saida } = apararDemasiadoLongos(json, [
      {
        code: "too_big",
        origin: "string",
        maximum: 400,
        path: ["beneficiarios", "tipos", "evidencia"],
      },
    ]);
    const aparada = (
      saida as { beneficiarios: { tipos: { evidencia: string } } }
    ).beneficiarios.tipos.evidencia;
    expect(aparada).toHaveLength(400);
    // É o que mantém o portão de alucinação com a mesma força: uma citação
    // honesta aparada continua literal, e uma paráfrase aparada continua paráfrase.
    expect(citacao.startsWith(aparada)).toBe(true);
  });

  it("não toca em nada que não seja um comprimento", () => {
    const json = { estado: { valor: "inventado" } };
    const { json: saida, aparados } = apararDemasiadoLongos(json, [
      {
        code: "invalid_value",
        origin: "string",
        path: ["estado", "valor"],
      },
    ]);
    expect(aparados).toEqual([]);
    expect(saida).toEqual({ estado: { valor: "inventado" } });
  });

  it("não inventa estrutura quando o caminho não existe no que o modelo enviou", () => {
    const json = { identificacao: {} };
    const { json: saida, aparados } = apararDemasiadoLongos(json, [
      { code: "too_big", origin: "string", maximum: 10, path: ["a", "b", "c"] },
    ]);
    expect(aparados).toEqual([]);
    expect(saida).toEqual({ identificacao: {} });
  });
});
