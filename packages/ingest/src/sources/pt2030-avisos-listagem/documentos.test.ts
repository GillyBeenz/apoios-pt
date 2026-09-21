import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  candidatosDeAvisos,
  documentosDeAviso,
  urlDeDescarga,
} from "./documentos.ts";

const RESPOSTA = readFileSync(
  new URL(
    "../comum/fixtures-permanentes/pt2030-avisos-query-resposta.json",
    import.meta.url,
  ),
  "utf8",
);

describe("urlDeDescarga", () => {
  it("monta a rota que o wp-json declara", () => {
    expect(
      urlDeDescarga("avisos/2023/9/abc/def", "siag-prod-container"),
    ).toBe(
      "https://portugal2030.pt/wp-json/avisos/download" +
        "?path=avisos%2F2023%2F9%2Fabc%2Fdef&container=siag-prod-container",
    );
  });

  it("escapa o que precisa de ser escapado", () => {
    // Um `path` com barras tem de ir codificado, senão o servidor lê meia rota.
    expect(urlDeDescarga("a/b c", "x")).toContain("path=a%2Fb+c");
  });
});

describe("documentosDeAviso", () => {
  const comDocs = (docs: unknown[]): unknown => ({ documentos: docs });
  const doc = (sobrepor: Record<string, unknown> = {}): unknown => ({
    documentoDesignacao: "CENTRO2030-2024-11.pdf",
    tipoDocumentoDesignacao: "Aviso",
    path: "avisos/2024/2/a/b",
    container: "siag-prod-container",
    ...sobrepor,
  });

  it("fica só com os do tipo «Aviso»", () => {
    const r = documentosDeAviso(
      comDocs([
        doc(),
        doc({ tipoDocumentoDesignacao: "Anexo", documentoDesignacao: "anexo.pdf" }),
        doc({
          tipoDocumentoDesignacao: "Perguntas frequentes",
          documentoDesignacao: "faq.pdf",
        }),
      ]),
    );
    expect(r.map((d) => d.nome)).toEqual(["CENTRO2030-2024-11.pdf"]);
  });

  /**
   * O rótulo está certo 99,6% das vezes, que é exactamente a taxa a que se passa
   * a confiar nele. Dos 673 documentos do tipo «Aviso» na listagem de 21/09/2026,
   * dois são `.docx` e um é o `DOC4_Modelo_Mapa_orçamental.xlsx` do
   * `CENTRO2030-2026-16` — um mapa orçamental arquivado como se fosse o aviso.
   */
  it("não aceita um xlsx só por estar arquivado como «Aviso»", () => {
    const r = documentosDeAviso(
      comDocs([
        doc({ documentoDesignacao: "DOC4_Modelo_Mapa_orçamental.xlsx" }),
        doc({ documentoDesignacao: "aviso_alterado.docx" }),
        doc(),
      ]),
    );
    expect(r.map((d) => d.nome)).toEqual(["CENTRO2030-2024-11.pdf"]);
  });

  it("deixa cair um documento a que falte path ou container", () => {
    expect(documentosDeAviso(comDocs([doc({ path: null })]))).toEqual([]);
    expect(documentosDeAviso(comDocs([doc({ container: "" })]))).toEqual([]);
  });

  it("aguenta uma resposta com outra forma sem rebentar", () => {
    expect(documentosDeAviso(null)).toEqual([]);
    expect(documentosDeAviso({})).toEqual([]);
    expect(documentosDeAviso({ documentos: "nao e uma lista" })).toEqual([]);
    expect(documentosDeAviso(comDocs([null, 7, "x"]))).toEqual([]);
  });
});

describe("candidatosDeAvisos", () => {
  it("rende um candidato por aviso da resposta real", () => {
    const c = candidatosDeAvisos(RESPOSTA);
    // Os cinco avisos da captura de 14/09/2026 têm um documento «Aviso» cada.
    expect(c).toHaveLength(5);
    expect(c.every((x) => x.tipoDocumento === "pdf")).toBe(true);
    expect(c.every((x) => x.urlDetalhe.startsWith(
      "https://portugal2030.pt/wp-json/avisos/download?path=",
    ))).toBe(true);
  });

  /**
   * A referência é o que faz a extracção cair em cima do apoio que o caminho do
   * dataset já criou, em vez de o duplicar: `construirChaves` dá força 100 a uma
   * referência legal, e as duas vêm do mesmo `sourceId`.
   */
  it("leva o código do aviso como referência legal", () => {
    const c = candidatosDeAvisos(RESPOSTA);
    expect(c.map((x) => x.referenciaLegalBruta)).toContain("ALT2030-2026-44");
  });

  it("cada candidato tem o seu próprio endereço", () => {
    const c = candidatosDeAvisos(RESPOSTA);
    expect(new Set(c.map((x) => x.urlDetalhe)).size).toBe(c.length);
  });

  /**
   * O portão que faz esta fase ser segura de correr. Com vários documentos há uma
   * versão em vigor para escolher, e escolher mal é anunciar condições revogadas
   * a quem se candidata.
   */
  it("deixa de fora um aviso com mais do que um documento «Aviso»", () => {
    const json = JSON.stringify({
      avisos: [
        {
          aviso: { codigoAviso: "CENTRO2030-2024-11", designacaoPT: "Um aviso" },
          documentos: [
            {
              documentoDesignacao: "CENTRO2030-2024-11.pdf",
              tipoDocumentoDesignacao: "Aviso",
              path: "p/1",
              container: "c",
            },
            {
              documentoDesignacao: "CENTRO2030-2024-11_1.ª Alt.pdf",
              tipoDocumentoDesignacao: "Aviso",
              path: "p/2",
              container: "c",
            },
          ],
        },
      ],
    });
    expect(candidatosDeAvisos(json)).toEqual([]);
    expect(candidatosDeAvisos(json, { incluirAmbiguos: true })).toHaveLength(1);
  });

  it("deixa de fora um aviso sem documento «Aviso» nenhum", () => {
    const json = JSON.stringify({
      avisos: [
        {
          aviso: { codigoAviso: "X-1", designacaoPT: "Sem PDF" },
          documentos: [
            {
              documentoDesignacao: "anexo.pdf",
              tipoDocumentoDesignacao: "Anexo",
              path: "p",
              container: "c",
            },
          ],
        },
      ],
    });
    expect(candidatosDeAvisos(json)).toEqual([]);
  });

  it("um JSON que não é JSON dá zero candidatos, não uma excepção", () => {
    expect(candidatosDeAvisos("{nao e json")).toEqual([]);
    expect(candidatosDeAvisos("[]")).toEqual([]);
    expect(candidatosDeAvisos('{"avisos":"x"}')).toEqual([]);
  });
});
