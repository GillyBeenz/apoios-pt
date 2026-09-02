import { describe, expect, it } from "vitest";
import type { DocumentoEntrada, ExtractorLike, ResultadoExtraccao } from "@apoios/extraction";
import { extraccaoSolar } from "@apoios/extraction/teste";
import { executarFonte } from "./executar.ts";
import { ArmazemMemoria } from "./armazem.ts";
import { BuscadorMemoria } from "../http/replay.ts";
import type { Fonte } from "../sources/tipos.ts";
import { extrair } from "../sources/fundo-ambiental-aac/extract.ts";

const AGORA = new Date("2026-08-27T09:00:00Z");
const BASE = "https://www.fundoambiental.pt";
const URL_LISTAGEM = `${BASE}/apoios-2026.aspx`;
const URL_DETALHE = `${BASE}/apoios-2026/transicao-energetica1/022026-solar.aspx`;

const fonte: Fonte = {
  id: "fundo-ambiental-aac",
  nome: "Fundo Ambiental — AAC",
  entidade: "Fundo Ambiental",
  urlBase: BASE,
  urlsEntrada: [URL_LISTAGEM],
  tipo: "listagem",
  cadenciaHoras: 24,
  candidatosMin: 1,
  extrair,
};

function listagem(viewstate = "AAAA"): string {
  return `<html><body>
    <input type="hidden" name="__VIEWSTATE" value="${viewstate.repeat(50)}" />
    <article>
      <h3><a href="/apoios-2026/transicao-energetica1/022026-solar.aspx">Aviso de Abertura de Concurso n.º 02/2026 — Solar</a></h3>
      <span>Candidaturas até 30/09/2026</span>
    </article>
  </body></html>`;
}

/** Detail page whose visible text carries the quotes the extraction cites. */
function detalhe(prazo = "até às 18:00 do dia 30 de setembro de 2026"): string {
  return `<html><body><main>
    <h1>Aviso de Abertura de Concurso n.º 02/2026</h1>
    <p>Beneficiários: pessoas singulares proprietárias de habitação própria e permanente,
       bem como condomínios de edifícios de habitação.</p>
    <p>As candidaturas decorrem entre 1 de março de 2026 e ${prazo}.</p>
    <p>A dotação global do presente aviso é de 15.000.000,00 €.</p>
    <p>Apoio a sistemas solares fotovoltaicos para autoconsumo.</p>
  </main></body></html>`;
}

/** Stub extractor: deterministic, offline, free. */
function extractorFixo(sobrepor: Parameters<typeof extraccaoSolar>[0] = {}): ExtractorLike {
  return {
    async extrair(_doc: DocumentoEntrada): Promise<ResultadoExtraccao> {
      return {
        extraccao: extraccaoSolar(sobrepor),
        stopReason: "end_turn",
        modelo: "claude-opus-5",
        versaoPrompt: "v1",
        versaoEsquema: "1",
        tokensEntrada: 20_000,
        tokensSaida: 3_000,
        tokensCacheLidos: 5_000,
        erro: null,
      };
    },
  };
}

function contexto(buscador: BuscadorMemoria, armazem: ArmazemMemoria, extractor = extractorFixo()) {
  return { fonte, buscador, armazem, extractor, agora: AGORA };
}

describe("executarFonte", () => {
  it("descobre um aviso novo e emite um evento", async () => {
    const buscador = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    const armazem = new ArmazemMemoria();

    const r = await executarFonte(contexto(buscador, armazem));

    expect(r.metricas.candidatos).toBe(1);
    expect(r.apoiosNovos).toHaveLength(1);
    expect(r.eventos.map((e) => e.tipo)).toEqual(["programa_novo"]);
    expect(r.apoiosNovos[0]?.alertavel).toBe(true);
  });

  /**
   * The property that makes the pipeline safe to retry: replaying an unchanged
   * world must produce no new events at all, so a re-run never re-alerts anyone.
   */
  it("é idempotente — repetir a execução não gera eventos novos", async () => {
    const buscador = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    const armazem = new ArmazemMemoria();

    await executarFonte(contexto(buscador, armazem));
    const eventosApos1 = armazem.eventos.size;

    const segunda = await executarFonte(contexto(buscador, armazem));

    expect(segunda.eventos).toHaveLength(0);
    expect(armazem.eventos.size).toBe(eventosApos1);
    expect(armazem.apoios.size).toBe(1);
  });

  /**
   * Directly guards the cost model. A rotated viewstate on an otherwise identical
   * page must not reach the model at all.
   */
  it("não chama o modelo quando só o __VIEWSTATE roda", async () => {
    const armazem = new ArmazemMemoria();
    let chamadas = 0;
    const extractor: ExtractorLike = {
      async extrair(doc) {
        chamadas++;
        return extractorFixo().extrair(doc);
      },
    };

    const dia1 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem("AAAA") })
      .definir(URL_DETALHE, { corpo: detalhe() });
    await executarFonte({ ...contexto(dia1, armazem, extractor) });
    expect(chamadas).toBe(1);

    const dia2 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem("ZZZZ") })
      .definir(URL_DETALHE, { corpo: detalhe() });
    await executarFonte({ ...contexto(dia2, armazem, extractor) });

    expect(chamadas).toBe(1);
  });

  it("para cedo quando o servidor responde 304", async () => {
    const armazem = new ArmazemMemoria();
    const buscador = new BuscadorMemoria().definir(URL_LISTAGEM, {
      status: 304,
      naoModificado: true,
      corpo: null,
    });

    const r = await executarFonte(contexto(buscador, armazem));
    expect(r.metricas.candidatos).toBe(0);
    expect(r.metricas.chamadasModelo).toBe(0);
    expect(r.saltouPorNaoModificado).toBe(true);
  });

  it("mantém um único apoio quando o URL do aviso muda", async () => {
    const armazem = new ArmazemMemoria();

    const dia1 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    await executarFonte(contexto(dia1, armazem));

    // Same notice, same legal reference, republished at a new address.
    const urlNovo = `${BASE}/apoios-2026/transicao-energetica1/022026-solar-republicado.aspx`;
    const listagemNova = listagem().replace("/apoios-2026/transicao-energetica1/022026-solar.aspx", urlNovo);
    const dia2 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagemNova })
      .definir(urlNovo, { corpo: detalhe() });

    const r = await executarFonte(contexto(dia2, armazem));

    expect(armazem.apoios.size).toBe(1);
    expect(r.apoiosNovos).toHaveLength(0);
    // Crucially: no second "programa_novo", so nobody is told twice.
    expect(r.eventos.map((e) => e.tipo)).not.toContain("programa_novo");
  });

  it("emite exactamente um prazo_alterado quando o prazo é prolongado", async () => {
    const armazem = new ArmazemMemoria();

    const dia1 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    await executarFonte(contexto(dia1, armazem));

    const prazoNovo = "até às 18:00 do dia 31 de outubro de 2026";
    const extractorProlongado = extractorFixo({
      prazos: {
        abertura: {
          valor: { texto_fonte: "1 de março de 2026", data_iso: "2026-03-01", precisao: "dia" },
          confianca: "alta",
          evidencia: "As candidaturas decorrem entre 1 de março de 2026",
          pagina: 1,
        },
        encerramento: {
          valor: { texto_fonte: prazoNovo, data_iso: "2026-10-31", precisao: "minuto" },
          confianca: "alta",
          evidencia: prazoNovo,
          pagina: 1,
        },
      },
    });

    const dia2 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe(prazoNovo) });

    const r = await executarFonte(contexto(dia2, armazem, extractorProlongado));

    const prazos = r.eventos.filter((e) => e.tipo === "prazo_alterado");
    expect(prazos).toHaveLength(1);
    expect(prazos[0]?.payload.prolongado).toBe(true);
  });

  it("uma alteração cosmética no detalhe não produz eventos", async () => {
    const armazem = new ArmazemMemoria();

    const dia1 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    await executarFonte(contexto(dia1, armazem));

    // Content genuinely changed (so the gate opens and the model runs), but
    // nothing that survives into the normalised record changed.
    const dia2 = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, {
        corpo: detalhe().replace("</main>", "<p>Contacto: 210 000 000.</p></main>"),
      });

    const r = await executarFonte(contexto(dia2, armazem));
    expect(r.eventos).toEqual([]);
  });

  it("retém alertas quando a elegibilidade de particulares é desconhecida", async () => {
    const buscador = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    const armazem = new ArmazemMemoria();

    const incerto = extractorFixo({
      beneficiarios: {
        tipos: {
          valor: ["municipio", "ipss"],
          confianca: "alta",
          evidencia: "Beneficiários: pessoas singulares proprietárias",
          pagina: 1,
        },
        admite_particulares: {
          valor: "desconhecido",
          confianca: "alta",
          evidencia: "Beneficiários: pessoas singulares proprietárias",
          pagina: 1,
        },
        restricoes_texto: null,
      },
    });

    const r = await executarFonte(contexto(buscador, armazem, incerto));

    const apoio = r.apoiosNovos[0];
    expect(apoio?.alertavel).toBe(false);
    // Still listed, so a curious user can check the official notice themselves.
    expect(apoio?.publicado).toBe(true);
    expect(apoio?.needsReview).toBe(true);
  });

  it("em simulação não escreve nada nem chama o modelo", async () => {
    const buscador = new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });
    const armazem = new ArmazemMemoria();
    let chamadas = 0;
    const extractor: ExtractorLike = {
      async extrair(doc) {
        chamadas++;
        return extractorFixo().extrair(doc);
      },
    };

    const r = await executarFonte({ ...contexto(buscador, armazem, extractor), simulacao: true });

    expect(chamadas).toBe(0);
    expect(armazem.apoios.size).toBe(0);
    expect(armazem.eventos.size).toBe(0);
    // The listing was still fetched and parsed, so a dry run genuinely exercises
    // the selectors rather than merely printing intent.
    expect(r.metricas.candidatos).toBe(1);
  });
});
