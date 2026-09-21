import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type {
  DocumentoEntrada,
  ExtractorLike,
  ResultadoExtraccao,
} from "@apoios/extraction";
import { custoDaChamada } from "@apoios/extraction";
import { extraccaoSolar } from "@apoios/extraction/teste";
import { executarFonte, quantosCabemNoTecto } from "./executar.ts";
import { ArmazemMemoria } from "./armazem.ts";
import { BuscadorMemoria } from "../http/replay.ts";
import type { Buscador, PedidoCondicional, RespostaHttp } from "../http/tipos.ts";
import { pt2030AvisosListagem } from "../sources/pt2030-avisos-listagem/index.ts";
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
  estado: "activa",
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
function extractorFixo(
  sobrepor: Parameters<typeof extraccaoSolar>[0] = {},
): ExtractorLike {
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
        tokensCacheEscritos: 0,
        custoUsd: custoDaChamada("claude-opus-5", {
          tokensEntrada: 20_000,
          tokensSaida: 3_000,
          tokensCacheLidos: 5_000,
          tokensCacheEscritos: 0,
        }),
        erro: null,
      };
    },
  };
}

function contexto(
  buscador: BuscadorMemoria,
  armazem: ArmazemMemoria,
  extractor = extractorFixo(),
) {
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

  /**
   * The bug that made a failed extraction permanent.
   *
   * The snapshot is written before the model call, so a call that produced
   * nothing still left a row at the current hash. While the change gate was
   * broken every page hashed differently on every run and everything got retried
   * by accident; fixing the gate turned that accident into a permanent skip, and
   * execução #24 lost 21 of 34 documents to it.
   */
  it("volta a tentar um documento cuja extracção falhou", async () => {
    const armazem = new ArmazemMemoria();
    let chamadas = 0;

    const extractorQueFalha: ExtractorLike = {
      async extrair(): Promise<ResultadoExtraccao> {
        chamadas++;
        return {
          extraccao: null,
          stopReason: null,
          modelo: "claude-opus-5",
          versaoPrompt: "v2",
          versaoEsquema: "3",
          tokensEntrada: 20_000,
          tokensSaida: 0,
          tokensCacheLidos: 5_000,
          tokensCacheEscritos: 0,
          custoUsd: custoDaChamada("claude-opus-5", {
            tokensEntrada: 20_000,
            tokensSaida: 0,
            tokensCacheLidos: 5_000,
            tokensCacheEscritos: 0,
          }),
          erro: "JSON não valida contra o esquema",
        };
      },
    };

    const mundo = () =>
      new BuscadorMemoria()
        .definir(URL_LISTAGEM, { corpo: listagem() })
        .definir(URL_DETALHE, { corpo: detalhe() });

    const r1 = await executarFonte({
      ...contexto(mundo(), armazem, extractorQueFalha),
    });
    expect(r1.metricas.extraccoesFalhadas).toBe(1);
    expect(chamadas).toBe(1);

    // Same page, same bytes. The document was never extracted, so the gate must
    // not treat it as done.
    await executarFonte({ ...contexto(mundo(), armazem, extractorQueFalha) });
    expect(chamadas).toBe(2);

    // And once it succeeds, it stops being retried.
    await executarFonte({ ...contexto(mundo(), armazem, extractorFixo()) });
    await executarFonte({ ...contexto(mundo(), armazem, extractorFixo()) });
    expect(chamadas).toBe(2);
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
    const listagemNova = listagem().replace(
      "/apoios-2026/transicao-energetica1/022026-solar.aspx",
      urlNovo,
    );
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
          valor: {
            texto_fonte: "1 de março de 2026",
            data_iso: "2026-03-01",
            precisao: "dia",
          },
          confianca: "alta",
          evidencia: "As candidaturas decorrem entre 1 de março de 2026",
        },
        encerramento: {
          valor: {
            texto_fonte: prazoNovo,
            data_iso: "2026-10-31",
            precisao: "minuto",
          },
          confianca: "alta",
          evidencia: prazoNovo,
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
        corpo: detalhe().replace(
          "</main>",
          "<p>Contacto: 210 000 000.</p></main>",
        ),
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
        },
        admite_particulares: {
          valor: "desconhecido",
          confianca: "alta",
          evidencia: "Beneficiários: pessoas singulares proprietárias",
        },
        restricoes_texto: "",
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

    const r = await executarFonte({
      ...contexto(buscador, armazem, extractor),
      simulacao: true,
    });

    expect(chamadas).toBe(0);
    expect(armazem.apoios.size).toBe(0);
    expect(armazem.eventos.size).toBe(0);
    // The listing was still fetched and parsed, so a dry run genuinely exercises
    // the selectors rather than merely printing intent.
    expect(r.metricas.candidatos).toBe(1);
  });
});

/**
 * The gap that made execução #23 undebuggable.
 *
 * That run produced three real funds and `verificarProvas` rejected the evidence
 * for every field of all three. There was no way to see what the model had
 * actually quoted: `fund_extractions` has existed since the first migration and
 * nothing ever wrote to it. A hallucination gate you cannot audit is a gate you
 * cannot trust in either direction — you cannot tell a caught invention from a
 * rejected honest quote.
 */
describe("o rasto de auditoria das extracções", () => {
  const mundo = () =>
    new BuscadorMemoria()
      .definir(URL_LISTAGEM, { corpo: listagem() })
      .definir(URL_DETALHE, { corpo: detalhe() });

  it("guarda a extracção, com o bruto do modelo", async () => {
    const armazem = new ArmazemMemoria();
    const r = await executarFonte(contexto(mundo(), armazem));

    expect(r.apoiosNovos).toHaveLength(1);
    expect(armazem.extraccoes).toHaveLength(1);

    const reg = armazem.extraccoes[0]!;
    // The raw extraction, not the normalised Apoio — the point is to see exactly
    // what the model said, including the quotes that were rejected.
    expect(reg.bruto).not.toBeNull();
    expect(reg.fundId).toBe(r.apoiosNovos[0]!.id);
    expect(reg.modelo).toBe("claude-opus-5");
    expect(reg.tokensEntrada).toBe(20_000);
  });

  it("regista as provas que falharam e a confiança efectiva", async () => {
    const armazem = new ArmazemMemoria();
    // An invented quote: nothing in `detalhe()` contains this sentence.
    await executarFonte(
      contexto(
        mundo(),
        armazem,
        extractorFixo({
          estado: {
            valor: "aberto",
            confianca: "alta",
            evidencia: "uma frase que o documento nunca contém",
          },
        }),
      ),
    );

    const reg = armazem.extraccoes[0]!;
    expect(reg.evidenciaFalhou).toContain("estado");
    // Verification downgrades a failed quote to `baixa`, and the record keeps it.
    expect(reg.confiancaCampos["estado"]).toBe("baixa");
  });

  it("não escreve nada em simulação", async () => {
    const armazem = new ArmazemMemoria();
    await executarFonte({ ...contexto(mundo(), armazem), simulacao: true });
    expect(armazem.extraccoes).toHaveLength(0);
  });
});

/**
 * The bug that cost the product its subject.
 *
 * The Fundo Ambiental listing yields 47 candidates and the cap was 25, applied as
 * `candidatos.slice(0, 25)` in document order. Everything below the cut was never
 * fetched — and what sat below the cut was the whole `c13 — eficiência energética
 * em edifícios` section: PAE+S, Vale Eficiência, E-Lar, Condomínios Residenciais,
 * Bairros Mais Sustentáveis. Every household scheme this app exists to alert on.
 *
 * Confirmed against the live database before fixing: 220 PRR detail pages fetched,
 * covering c8, c9, c10 and c12, and not one from c13.
 *
 * What made it survive so long is that a dropped candidate is indistinguishable
 * downstream from one that was fetched and found unchanged. Both simply produce
 * nothing. So the run reported success, the health rules saw a healthy candidate
 * count, and the catalogue was quietly missing its entire reason to exist.
 */
describe("limite de detalhes por execução", () => {
  const N = 40;

  function listagemGrande(): string {
    const linhas = Array.from({ length: N }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `<article><h3><a href="/apoios-2026/seccao-${n}/${n}2026-aviso-numero-${n}.aspx">Aviso de Abertura de Concurso n.º ${n}/2026 — Medida ${n}</a></h3><span>Candidaturas até 30/09/2026</span></article>`;
    }).join("");
    return `<html><body>${linhas}</body></html>`;
  }

  function buscadorGrande(): BuscadorMemoria {
    const b = new BuscadorMemoria().definir(URL_LISTAGEM, {
      corpo: listagemGrande(),
    });
    for (let i = 1; i <= N; i++) {
      const n = String(i).padStart(2, "0");
      b.definir(`${BASE}/apoios-2026/seccao-${n}/${n}2026-aviso-numero-${n}.aspx`, {
        corpo: detalhe(),
      });
    }
    return b;
  }

  it("não deixa cair candidatos com o limite por omissão", async () => {
    // Este teste falhava antes da correcção: com o limite a 25, os 15 últimos
    // avisos — a secção que interessa ao produto — nunca eram sequer buscados.
    const armazem = new ArmazemMemoria();
    const r = await executarFonte(contexto(buscadorGrande(), armazem));

    expect(r.metricas.candidatos).toBe(N);
    expect(r.metricas.candidatosIgnorados).toBe(0);
    // `chamadasModelo` e não `apoiosNovos`: o extractor de teste devolve a mesma
    // extracção para todos os documentos, por isso a identidade dobra os 40 num
    // único apoio — e bem. O que este teste mede é se cada candidato chegou a ser
    // buscado e processado, não quantos apoios distintos daí saíram.
    expect(r.metricas.chamadasModelo).toBe(N);
  });

  it("processa o fim da listagem, não só o princípio", async () => {
    // O corte era em ordem de documento, por isso a prova que interessa é sobre o
    // último candidato e não sobre a contagem.
    const armazem = new ArmazemMemoria();
    await executarFonte(contexto(buscadorGrande(), armazem));

    const ultimo = `${BASE}/apoios-2026/seccao-${N}/${N}2026-aviso-numero-${N}.aspx`;
    expect(await armazem.snapshotAnterior(ultimo)).not.toBeNull();
  });

  it("conta e não esconde os que o limite recusa", async () => {
    // Um limite ultrapassado deixa de ser silencioso. Um candidato deixado cair é
    // indistinguível, a jusante, de um candidato buscado e sem alterações — foi
    // essa ambiguidade que escondeu a perda durante toda a vida do projecto.
    const armazem = new ArmazemMemoria();
    const r = await executarFonte({
      ...contexto(buscadorGrande(), armazem),
      maxDetalhes: 10,
    });

    expect(r.metricas.candidatos).toBe(N);
    expect(r.metricas.candidatosIgnorados).toBe(N - 10);
    expect(r.metricas.chamadasModelo).toBe(10);
  });

  it("continua a proteger contra uma listagem em fuga", async () => {
    // O limite continua a existir: é uma protecção, não um orçamento.
    const armazem = new ArmazemMemoria();
    const r = await executarFonte({
      ...contexto(buscadorGrande(), armazem),
      maxDetalhes: 1,
    });

    expect(r.metricas.chamadasModelo).toBe(1);
    expect(r.metricas.candidatosIgnorados).toBe(N - 1);
  });
});

/**
 * O resumo gravado tem de levar os conflitos.
 *
 * `cli.ts` monta o objecto que fica em `ingest_runs.resumo`, e a função
 * `assinalar_conflitos_de_identidade()` lê os conflitos de lá para levantar um
 * alerta de operador. Se o campo desaparecer do resumo, o alerta deixa de
 * disparar — e deixa de disparar em silêncio, que é exactamente o defeito que
 * ele existe para corrigir.
 *
 * Isto não testa o `cli.ts` (que é um ponto de entrada com efeitos), testa o
 * contrato de que ele depende: `executar()` devolve `conflitos`, e devolve-o
 * como lista.
 */
describe("contrato do resumo", () => {
  it("devolve sempre uma lista de conflitos, mesmo vazia", async () => {
    const buscador = new BuscadorMemoria().definir(URL_LISTAGEM, {
      corpo: "<html><body></body></html>",
    });
    const r = await executarFonte(contexto(buscador, new ArmazemMemoria()));

    // Vazia, e é esse o ponto: o campo tem de existir mesmo quando não há
    // conflito nenhum, senão o `resumo` grava-o só às vezes e a função do
    // Postgres passa a ler um caminho que não sabe que existe.
    expect(Array.isArray(r.conflitos)).toBe(true);
    expect(r.conflitos).toEqual([]);
  });
});

/**
 * Uma fonte paginada é varrida até ao fim, e cada página fica arrumada sozinha.
 *
 * O defeito que isto guarda custou 223 avisos abertos: o livro de snapshots é
 * indexado por URL, e as 46 páginas do PT2030 partilham um URL. Sem uma chave
 * por página, a segunda sobrescrevia o portão da primeira e todas ficavam a
 * parecer permanentemente mudadas — mas antes disso nem sequer eram pedidas,
 * porque não havia como as pedir.
 *
 * Usa-se aqui a fonte real, e não uma inventada: o que se quer provar é que o
 * `pedidosEntrada` dela, tal como está declarado, produz mesmo um varrimento.
 */
describe("varrimento paginado", () => {
  /** Responde por página, porque é o corpo que as distingue e não o URL. */
  class BuscadorPaginado implements Buscador {
    readonly pedidas: number[] = [];
    constructor(private readonly ultimaComDados: number) {}

    async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
      const pagina = Number(new URLSearchParams(pedido.corpo ?? "").get("page"));
      this.pedidas.push(pagina);
      // O sentinela do PT2030: `200` com `{code:404}` e sem `avisos`.
      const corpo =
        pagina > this.ultimaComDados
          ? '{"code":404,"info":"No data found"}'
          : JSON.stringify({
              status: 201,
              avisos: [
                {
                  aviso: { codigoAviso: `X-${pagina}`, designacaoPT: `Aviso ${pagina}` },
                  estrutura: [],
                  calendario: { dataInicio: "2026-09-01T00:00:00" },
                  documentos: [],
                },
              ],
            });
      return {
        url: pedido.url,
        status: 200,
        naoModificado: false,
        corpo,
        bytes: null,
        contentType: "application/json",
        etag: null,
        lastModified: null,
        erro: null,
      };
    }
  }

  function contextoPt2030(buscador: Buscador, armazem: ArmazemMemoria) {
    return {
      fonte: pt2030AvisosListagem,
      buscador,
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    };
  }

  it("pede páginas até uma vir vazia, e não mais", async () => {
    const buscador = new BuscadorPaginado(2);
    await executarFonte(contextoPt2030(buscador, new ArmazemMemoria()));

    // Zero a dois trazem avisos; a três é o sentinela e fecha o varrimento.
    // Que comece no ZERO é metade do que este teste guarda: começar no um
    // saltava a segunda página do conjunto sem dar erro nenhum.
    expect(buscador.pedidas).toEqual([0, 1, 2, 3]);
  });

  it("repete uma página que falhou, em vez de dar o varrimento por acabado", async () => {
    // Medido, não suposto: o primeiro varrimento a sério deste endpoint morreu
    // na página 44 de 46 com um `timeout`. Uma página que falha não rende
    // registo nenhum e o ciclo pára — não porque o conjunto acabou, mas porque
    // a rede tossiu. Sem repetição, o varrimento fica truncado a 96% e a
    // corrida seguinte tem a mesma probabilidade de morrer algures.
    class FalhaUmaVez extends BuscadorPaginado {
      falhou = false;
      override async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
        const pagina = Number(new URLSearchParams(pedido.corpo ?? "").get("page"));
        if (pagina === 1 && !this.falhou) {
          this.falhou = true;
          this.pedidas.push(pagina);
          return {
            url: pedido.url, status: 0, naoModificado: false, corpo: null,
            bytes: null, contentType: null, etag: null, lastModified: null,
            erro: "The operation was aborted due to timeout",
          };
        }
        return super.buscar(pedido);
      }
    }

    const buscador = new FalhaUmaVez(2);
    const r = await executarFonte(contextoPt2030(buscador, new ArmazemMemoria()));

    // A página 1 é pedida duas vezes, e o varrimento chega ao fim na mesma.
    expect(buscador.pedidas).toEqual([0, 1, 1, 2, 3]);
    expect(r.apoiosNovos).toHaveLength(3);
  });

  it("desiste depois da repetição, sem insistir num servidor que diz que não", async () => {
    class FalhaSempre extends BuscadorPaginado {
      override async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
        const pagina = Number(new URLSearchParams(pedido.corpo ?? "").get("page"));
        if (pagina === 1) {
          this.pedidas.push(pagina);
          return {
            url: pedido.url, status: 503, naoModificado: false, corpo: null,
            bytes: null, contentType: null, etag: null, lastModified: null,
            erro: "HTTP 503",
          };
        }
        return super.buscar(pedido);
      }
    }

    const buscador = new FalhaSempre(2);
    await executarFonte(contextoPt2030(buscador, new ArmazemMemoria()));

    // Duas tentativas à página 1, e pára. Não há terceira.
    expect(buscador.pedidas).toEqual([0, 1, 1]);
  });

  it("lê os apoios de todas as páginas, não só da primeira", async () => {
    const armazem = new ArmazemMemoria();
    const r = await executarFonte(contextoPt2030(new BuscadorPaginado(2), armazem));

    // Um aviso distinto por página, três páginas com dados.
    expect(r.apoiosNovos).toHaveLength(3);
  });

  it("dá a cada página a sua própria chave no livro de snapshots", async () => {
    const armazem = new ArmazemMemoria();
    await executarFonte(contextoPt2030(new BuscadorPaginado(2), armazem));

    // É esta a correcção. Com uma chave só, a última página escrita apagava o
    // portão das anteriores e o varrimento seguinte relia tudo de novo.
    const chaves = [...armazem.snapshots.keys()];
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves.length).toBeGreaterThanOrEqual(3);
  });

  it("não repete o trabalho quando nenhuma página mudou", async () => {
    const armazem = new ArmazemMemoria();
    await executarFonte(contextoPt2030(new BuscadorPaginado(2), armazem));
    const segunda = await executarFonte(
      contextoPt2030(new BuscadorPaginado(2), armazem),
    );

    // O portão da mudança tem de continuar a funcionar por página: se as chaves
    // colidissem, a segunda corrida via tudo como mudado.
    expect(segunda.apoiosNovos).toHaveLength(0);
  });
});

/**
 * A guarda que impede uma referência truncada de decidir identidade.
 *
 * O caso é real e está na base: o `pt2030-avisos` extrai por modelo sobre o texto
 * de artigos, e gravou `2024-47` para um aviso que o artigo escreve
 * `Centro2030-2024-47`. O prefixo é a região, e sem ele dois avisos de regiões
 * diferentes com o mesmo número dão a mesma chave de força 100 — o mais forte que
 * existe — e um come o outro sem deixar rasto.
 */
describe("uma referência truncada não entra na identidade", () => {
  const B = "https://portugal2030.pt";
  const L = `${B}/category/avisos/`;
  const U_NORTE = `${B}/2026/08/10/norte-rotas/`;
  const U_CENTRO = `${B}/2026/08/11/centro-rotas/`;

  /** As duas páginas escrevem o código inteiro; é o modelo que o encurta. */
  const artigo = (regiao: string) =>
    `<html><body><main><p>O Aviso ${regiao}2030-2026-24 visa apoiar operações
     de gestão e inventário de bens culturais na região.</p></main></body></html>`;

  const fonteRegioes: Fonte = {
    id: "pt2030-avisos",
    nome: "Portugal 2030 — Avisos",
    entidade: "Agência para o Desenvolvimento e Coesão",
    urlBase: B,
    urlsEntrada: [L],
    tipo: "listagem",
    cadenciaHoras: 24,
    estado: "activa",
    candidatosMin: 1,
    extrair: () =>
      [U_NORTE, U_CENTRO].map((u) => ({
        titulo: `Rotas ${u}`,
        urlDetalhe: u,
        urlCanonica: u,
        referenciaLegalBruta: null,
        dataBruta: null,
        tipoDocumento: "html" as const,
      })),
  };

  /** O modelo devolve a cauda, e só a cauda — como devolveu na realidade. */
  const extractorQueTrunca: ExtractorLike = {
    async extrair(doc: DocumentoEntrada): Promise<ResultadoExtraccao> {
      return {
        ...(await extractorFixo().extrair(doc)),
        extraccao: extraccaoSolar({
          identificacao: {
            // Títulos distintos: sem isso era o `titulo_norm` a fundi-los, e o
            // teste passava a medir outra coisa.
            titulo: `Rotas do património — ${doc.urlFonte}`,
            referencia_legal: {
              valor: "2026-24",
              confianca: "alta",
              evidencia: "",
            },
            programa_pai: "Portugal 2030",
            entidade_gestora: "Agência para o Desenvolvimento e Coesão",
            resumo_pt: "Apoio a rotas de património cultural.",
          },
        }),
      };
    },
  };

  it("dois avisos de regiões diferentes continuam dois apoios", async () => {
    const buscador = new BuscadorMemoria()
      .definir(L, { corpo: "<html><body>listagem</body></html>" })
      .definir(U_NORTE, { corpo: artigo("NORTE") })
      .definir(U_CENTRO, { corpo: artigo("CENTRO") });
    const armazem = new ArmazemMemoria();

    await executarFonte({
      fonte: fonteRegioes,
      buscador,
      armazem,
      extractor: extractorQueTrunca,
      agora: AGORA,
    });

    expect(armazem.apoios.size).toBe(2);

    // E a chave ambígua não chegou a existir. Se existisse, o segundo aviso teria
    // sido reconhecido como o primeiro e um deles desaparecia.
    expect([...armazem.identidades.keys()]).not.toContain("pt2030-avisos:2026-24");
  });
});

/**
 * Um documento que anuncia vários avisos rende um apoio só, e isso passa a
 * dizer-se em vez de se calar.
 *
 * O artigo do Centro 2030 anuncia `Centro2030-2024-47` a `-52`; o dos Açores
 * anuncia três. Medido a 17/09/2026: nenhum desses nove códigos está no endpoint
 * de avisos abertos, por isso os que ficam por capturar não entram por outra via.
 */
describe("um documento que anuncia varios avisos", () => {
  const B = "https://portugal2030.pt";
  const L = `${B}/category/avisos/`;
  const U = `${B}/2024/09/09/centro-2030-apoia-diversificacao/`;

  const fonteMulti: Fonte = {
    id: "pt2030-avisos",
    nome: "Portugal 2030 — Avisos",
    entidade: "Agência para o Desenvolvimento e Coesão",
    urlBase: B,
    urlsEntrada: [L],
    tipo: "listagem",
    cadenciaHoras: 24,
    estado: "activa",
    candidatosMin: 1,
    extrair: () => [
      {
        titulo: "Centro 2030 apoia diversificação da base produtiva regional",
        urlDetalhe: U,
        urlCanonica: U,
        referenciaLegalBruta: null,
        dataBruta: null,
        tipoDocumento: "html" as const,
      },
    ],
  };

  it("marca o apoio para revisão e diz quantos ficam por capturar", async () => {
    const buscador = new BuscadorMemoria()
      .definir(L, { corpo: "<html><body>listagem</body></html>" })
      .definir(U, {
        corpo: `<html><body><main><p>Os avisos abrangem toda a região:
          Centro2030-2024-47, Centro2030-2024-48, Centro2030-2024-49,
          Centro2030-2024-50, Centro2030-2024-51 e Centro2030-2024-52.</p>
        </main></body></html>`,
      });
    const armazem = new ArmazemMemoria();

    const r = await executarFonte({
      fonte: fonteMulti,
      buscador,
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect(r.apoiosNovos).toHaveLength(1);
    const apoio = r.apoiosNovos[0]!;
    expect(apoio.needsReview).toBe(true);
    // Seis anunciados, um capturado: cinco por capturar.
    expect(apoio.motivoRevisao).toContain("avisos_por_capturar:5");
  });

  it("não marca nada quando o documento anuncia um aviso só", async () => {
    const buscador = new BuscadorMemoria()
      .definir(L, { corpo: "<html><body>listagem</body></html>" })
      .definir(U, {
        corpo: `<html><body><main><p>O Aviso Centro2030-2024-47 abre
          candidaturas.</p></main></body></html>`,
      });
    const armazem = new ArmazemMemoria();

    const r = await executarFonte({
      fonte: fonteMulti,
      buscador,
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect(
      r.apoiosNovos[0]?.motivoRevisao.some((m) => m.startsWith("avisos_por_capturar")),
    ).toBe(false);
  });
});

/**
 * O tecto de custo, que é o orçamento que o `maxDetalhes` explicitamente não é.
 *
 * O comentário do `maxDetalhes` diz há muito que ele não é um controlo de custo e
 * que o passo caro — a chamada ao modelo — «é gerido em separado». Era gerido
 * apenas pelo portão da mudança de conteúdo, que responde à pergunta «vale a pena
 * chamar?» e nunca à pergunta «quanto é que já se gastou esta noite?».
 */
describe("tecto de custo", () => {
  const B = "https://portugal2030.pt";
  const L = `${B}/avisos/`;
  const urls = [1, 2, 3, 4, 5].map((n) => `${B}/aviso-${n}/`);

  const fonteCinco: Fonte = {
    id: "pt2030-avisos",
    nome: "Portugal 2030 — Avisos",
    entidade: "Agência para o Desenvolvimento e Coesão",
    urlBase: B,
    urlsEntrada: [L],
    tipo: "listagem",
    cadenciaHoras: 24,
    estado: "activa",
    candidatosMin: 1,
    extrair: () =>
      urls.map((u, i) => ({
        titulo: `Aviso ${i + 1}`,
        urlDetalhe: u,
        urlCanonica: u,
        referenciaLegalBruta: null,
        dataBruta: null,
        tipoDocumento: "html" as const,
      })),
  };

  function mundo(): { buscador: BuscadorMemoria; armazem: ArmazemMemoria } {
    let buscador = new BuscadorMemoria().definir(L, {
      corpo: "<html><body>listagem</body></html>",
    });
    for (const [i, u] of urls.entries()) {
      buscador = buscador.definir(u, {
        corpo: `<html><body><main><p>Aviso ${i + 1}: candidaturas abertas.</p></main></body></html>`,
      });
    }
    return { buscador, armazem: new ArmazemMemoria() };
  }

  // $0,1775 por chamada no `extractorFixo`.
  const POR_CHAMADA = 0.1775;

  it("sem tecto, chama o modelo para todos", async () => {
    const { buscador, armazem } = mundo();
    const r = await executarFonte({ ...contexto(buscador, armazem), fonte: fonteCinco });

    expect(r.metricas.chamadasModelo).toBe(5);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(0);
    expect(r.metricas.custoUsd).toBeCloseTo(POR_CHAMADA * 5, 6);
  });

  it("pára quando o gasto acumulado chega ao tecto", async () => {
    const { buscador, armazem } = mundo();
    const r = await executarFonte({
      ...contexto(buscador, armazem),
      fonte: fonteCinco,
      // Espaço para duas chamadas; a terceira encontra o tecto já atingido.
      tectoCustoUsd: POR_CHAMADA * 2,
    });

    expect(r.metricas.chamadasModelo).toBe(2);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(3);
  });

  /**
   * A propriedade que torna o tecto seguro: recusar não é perder.
   *
   * O snapshot é gravado antes da chamada e só é marcado processado depois dela,
   * e o `snapshotAnterior` só conta snapshots processados. Sem isso, um documento
   * recusado pelo orçamento ficava indistinguível de um documento conferido e
   * inalterado — e desaparecia para sempre por causa de uma noite cara.
   */
  it("o que o tecto recusou é tentado outra vez na corrida seguinte", async () => {
    const { buscador, armazem } = mundo();
    const vistos: string[] = [];
    const queRegista: ExtractorLike = {
      async extrair(doc) {
        vistos.push(doc.urlFonte);
        return extractorFixo().extrair(doc);
      },
    };

    const primeira = await executarFonte({
      ...contexto(buscador, armazem, queRegista),
      fonte: fonteCinco,
      tectoCustoUsd: POR_CHAMADA * 2,
    });
    expect(primeira.metricas.chamadasModelo).toBe(2);
    const naPrimeira = [...vistos];

    const segunda = await executarFonte({
      ...contexto(buscador, armazem, queRegista),
      fonte: fonteCinco,
    });

    expect(segunda.metricas.chamadasModelo).toBe(3);
    // Os três que ficaram de fora, e só esses: a segunda corrida não volta a
    // pagar pelos dois que já tinham sido extraídos.
    expect(vistos.slice(2)).toEqual(urls.filter((u) => !naPrimeira.includes(u)));
    expect(new Set(vistos).size).toBe(5);
  });

  it("um tecto que não se atinge não muda nada", async () => {
    const { buscador, armazem } = mundo();
    const r = await executarFonte({
      ...contexto(buscador, armazem),
      fonte: fonteCinco,
      tectoCustoUsd: 100,
    });

    expect(r.metricas.chamadasModelo).toBe(5);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(0);
  });

  /**
   * Em dúvida, não passa — a mesma regra do portão, aplicada ao dinheiro.
   *
   * `custoDaChamada` devolve `null` para um modelo sem preço fixado, de propósito:
   * um zero somaria em silêncio para um total que subestima a conta. Tratá-lo como
   * zero aqui deixava o tecto por atingir para sempre, que é a avaria exacta que o
   * `null` existe para evitar.
   */
  it("um modelo sem preço fecha o tecto em vez de gastar às cegas", async () => {
    const { buscador, armazem } = mundo();
    let chamadas = 0;
    const semPreco: ExtractorLike = {
      async extrair(doc) {
        chamadas++;
        return {
          ...(await extractorFixo().extrair(doc)),
          modelo: "claude-modelo-que-ninguem-fixou",
          custoUsd: null,
        };
      },
    };

    const r = await executarFonte({
      ...contexto(buscador, armazem, semPreco),
      fonte: fonteCinco,
      tectoCustoUsd: 100,
    });

    expect(chamadas).toBe(1);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(4);
    expect(r.metricas.errosExtraccao.join(" ")).toContain("sem preço em PRECOS");
  });

  it("sem tecto, um modelo sem preço não trava a corrida", async () => {
    // O tecto é opcional, e a corrida nocturna não o usa. Um preço em falta não
    // pode parar quem não pediu orçamento nenhum.
    const { buscador, armazem } = mundo();
    const semPreco: ExtractorLike = {
      async extrair(doc) {
        return { ...(await extractorFixo().extrair(doc)), custoUsd: null };
      },
    };

    const r = await executarFonte({ ...contexto(buscador, armazem, semPreco), fonte: fonteCinco });

    expect(r.metricas.chamadasModelo).toBe(5);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(0);
  });
});

/**
 * Os PDFs dos avisos do PT2030 passam a ser buscados, e o que não for um PDF
 * não chega ao modelo.
 *
 * O endpoint dá tudo o que um cartão precisa e não dá nem `medidas` nem
 * `beneficiarios` — não tem campo para nenhum dos dois. Um apoio sem medidas não
 * casa com subscritor nenhum, porque as subscrições são por medida, e é isso que
 * mantém o caminho de alerta em zero. As duas coisas estão no PDF.
 */
describe("fase de detalhe da listagem do PT2030", () => {
  const QUERY = "https://portugal2030.pt/wp-json/avisos/query";

  function respostaDaQuery(avisos: unknown[]): string {
    return JSON.stringify({ status: 201, avisos });
  }

  function avisoCom(codigo: string, documentos: unknown[]): unknown {
    return {
      aviso: { codigoAviso: codigo, designacaoPT: `Aviso ${codigo}` },
      estrutura: [],
      calendario: { dataInicio: "2026-09-01T00:00:00" },
      documentos,
    };
  }

  const docAviso = (nome: string, path: string): unknown => ({
    documentoDesignacao: nome,
    tipoDocumentoDesignacao: "Aviso",
    path,
    container: "siag-prod-container",
  });

  const urlDe = (path: string): string =>
    "https://portugal2030.pt/wp-json/avisos/download" +
    `?path=${encodeURIComponent(path)}&container=siag-prod-container`;

  /** Um PDF mínimo, com um stream de texto comprimido como os reais. */
  function pdfMinimo(texto: string): Uint8Array {
    const conteudo = `BT /F1 12 Tf (${texto}) Tj ET`;
    const comprimido = deflateSync(Buffer.from(conteudo, "latin1"));
    return Buffer.concat([
      Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Length ${comprimido.length} /Filter /FlateDecode >>\nstream\n`,
        "latin1",
      ),
      comprimido,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
  }

  class BuscadorDaQuery implements Buscador {
    readonly buscados: string[] = [];
    constructor(
      private readonly avisos: unknown[],
      private readonly ficheiros: Map<string, Uint8Array>,
    ) {}

    async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
      const base = {
        url: pedido.url,
        status: 200,
        naoModificado: false,
        etag: null,
        lastModified: null,
        erro: null,
      };

      if (pedido.url.startsWith(QUERY)) {
        const pagina = Number(
          new URLSearchParams(pedido.corpo ?? "").get("page"),
        );
        return {
          ...base,
          corpo:
            pagina === 0
              ? respostaDaQuery(this.avisos)
              : '{"code":404,"info":"No data found"}',
          bytes: null,
          contentType: "application/json",
        };
      }

      this.buscados.push(pedido.url);
      const bytes = this.ficheiros.get(pedido.url);
      if (bytes === undefined) throw new Error(`sem fixture: ${pedido.url}`);
      return {
        ...base,
        corpo: null,
        bytes,
        contentType: "application/octet-stream",
      };
    }
  }

  it("busca o PDF do aviso e manda-o ao modelo", async () => {
    const buscador = new BuscadorDaQuery(
      [avisoCom("ALT2030-2026-44", [docAviso("ALT2030-2026-44.pdf", "p/1")])],
      new Map([[urlDe("p/1"), pdfMinimo("Candidaturas abertas")]]),
    );
    const armazem = new ArmazemMemoria();
    let recebido: DocumentoEntrada | null = null;
    const extractor: ExtractorLike = {
      async extrair(doc) {
        recebido = doc;
        return extractorFixo().extrair(doc);
      },
    };

    const r = await executarFonte({
      fonte: pt2030AvisosListagem,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
    });

    expect(buscador.buscados).toEqual([urlDe("p/1")]);
    expect(r.metricas.chamadasModelo).toBe(1);
    // Os bytes originais vão no pedido, e o texto — que é contra o que as
    // citações são conferidas — sai de dentro do stream comprimido.
    expect(recebido!.pdf).toBeDefined();
    expect(recebido!.texto).toContain("Candidaturas abertas");
  });

  /**
   * A armadilha medida: o PT2030 anuncia documentos cujo blob já não existe, e o
   * Azure responde **HTTP 200** com 215 bytes de XML. Nem o código de estado nem
   * o hash denunciam. Sem a guarda, isso ia à API dentro de um bloco `document`
   * a dizer `application/pdf`.
   */
  it("não manda ao modelo um BlobNotFound servido com 200", async () => {
    const erro = new TextEncoder().encode(
      '﻿<?xml version="1.0" encoding="utf-8"?><Error>' +
        "<Code>BlobNotFound</Code><Message>The specified blob does not exist." +
        "</Message></Error>",
    );
    const buscador = new BuscadorDaQuery(
      [
        avisoCom("NORTE2030-2024-80", [docAviso("desaparecido.pdf", "p/1")]),
        avisoCom("ALT2030-2026-44", [docAviso("existe.pdf", "p/2")]),
      ],
      new Map([
        [urlDe("p/1"), erro],
        [urlDe("p/2"), pdfMinimo("Candidaturas abertas")],
      ]),
    );
    const armazem = new ArmazemMemoria();

    const r = await executarFonte({
      fonte: pt2030AvisosListagem,
      buscador,
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect(r.metricas.documentosQueNaoSaoPdf).toBe(1);
    // O outro passa: um documento em falta não leva a corrida atrás.
    expect(r.metricas.chamadasModelo).toBe(1);
  });

  it("um aviso com várias versões não é buscado", async () => {
    const buscador = new BuscadorDaQuery(
      [
        avisoCom("CENTRO2030-2024-11", [
          docAviso("CENTRO2030-2024-11.pdf", "p/1"),
          docAviso("CENTRO2030-2024-11_1.ª Alt.pdf", "p/2"),
        ]),
      ],
      new Map(),
    );

    const r = await executarFonte({
      fonte: pt2030AvisosListagem,
      buscador,
      armazem: new ArmazemMemoria(),
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect(buscador.buscados).toEqual([]);
    expect(r.metricas.chamadasModelo).toBe(0);
    // E o apoio do caminho barato entrou na mesma: o catálogo não fica à espera
    // da decisão de versão para mostrar o aviso.
    expect(r.apoiosNovos).toHaveLength(1);
  });

  it("o PDF inalterado não volta ao modelo na corrida seguinte", async () => {
    const ficheiros = new Map([
      [urlDe("p/1"), pdfMinimo("Candidaturas abertas")],
    ]);
    const avisos = [
      avisoCom("ALT2030-2026-44", [docAviso("ALT2030-2026-44.pdf", "p/1")]),
    ];
    const armazem = new ArmazemMemoria();

    const ctx = () => ({
      fonte: pt2030AvisosListagem,
      buscador: new BuscadorDaQuery(avisos, ficheiros),
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect((await executarFonte(ctx())).metricas.chamadasModelo).toBe(1);
    // É este portão que faz a actualização diária custar cêntimos: os bytes do
    // PDF são estáveis (medidos byte a byte com quatro dias de intervalo).
    expect((await executarFonte(ctx())).metricas.chamadasModelo).toBe(0);
  });
});

/**
 * O ciclo parte-se em duas fases quando o extractor sabe fazer lotes.
 *
 * A API de lotes só existe no plural: os pedidos vão todos de uma vez e a
 * resposta chega mais tarde, a metade do preço. É a única razão para o ciclo
 * estar partido, e sem um extractor que saiba fazer lotes as duas metades correm
 * de seguida como sempre correram.
 */
describe("extracção em lote", () => {
  const B = "https://portugal2030.pt";
  const L = `${B}/avisos/`;
  const urls = [1, 2, 3, 4, 5].map((n) => `${B}/aviso-${n}/`);

  const fonteCinco: Fonte = {
    id: "pt2030-avisos",
    nome: "Portugal 2030 — Avisos",
    entidade: "Agência para o Desenvolvimento e Coesão",
    urlBase: B,
    urlsEntrada: [L],
    tipo: "listagem",
    cadenciaHoras: 24,
    estado: "activa",
    candidatosMin: 1,
    extrair: () =>
      urls.map((u, i) => ({
        titulo: `Aviso ${i + 1}`,
        urlDetalhe: u,
        urlCanonica: u,
        referenciaLegalBruta: null,
        dataBruta: null,
        tipoDocumento: "html" as const,
      })),
  };

  function mundo(): { buscador: BuscadorMemoria; armazem: ArmazemMemoria } {
    let buscador = new BuscadorMemoria().definir(L, {
      corpo: "<html><body>listagem</body></html>",
    });
    for (const [i, u] of urls.entries()) {
      buscador = buscador.definir(u, {
        corpo: `<html><body><main><p>Aviso ${i + 1}: candidaturas abertas.</p></main></body></html>`,
      });
    }
    return { buscador, armazem: new ArmazemMemoria() };
  }

  /** Um extractor que responde em lote, como o `ExtractorLote` real. */
  function extractorDeLote(): ExtractorLike & {
    lotes: number;
    preparados: string[];
  } {
    const estado = { lotes: 0, preparados: [] as string[] };
    return {
      lotes: 0,
      preparados: estado.preparados,
      async prepararLote(docs: readonly DocumentoEntrada[]) {
        estado.lotes++;
        this.lotes = estado.lotes;
        for (const d of docs) estado.preparados.push(d.urlFonte);
      },
      async extrair(doc) {
        if (!estado.preparados.includes(doc.urlFonte)) {
          throw new Error(`não preparado: ${doc.urlFonte}`);
        }
        return extractorFixo().extrair(doc);
      },
    };
  }

  it("prepara tudo num lote só, antes de pedir a primeira resposta", async () => {
    const { buscador, armazem } = mundo();
    const extractor = extractorDeLote();

    const r = await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
    });

    expect(extractor.lotes).toBe(1);
    expect(extractor.preparados).toHaveLength(5);
    expect(r.metricas.chamadasModelo).toBe(5);
  });

  it("só entra no lote o que passou o portão da mudança", async () => {
    const { buscador, armazem } = mundo();

    await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor: extractorDeLote(),
      agora: AGORA,
    });

    // Segunda corrida: nada mudou, por isso o lote fica vazio e não se submete.
    const segundo = extractorDeLote();
    const r = await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor: segundo,
      agora: AGORA,
    });

    expect(segundo.lotes).toBe(0);
    expect(r.metricas.chamadasModelo).toBe(0);
  });

  /**
   * A diferença de semântica que o `custoEsperadoPorChamadaUsd` existe para
   * tornar visível: num lote não há um «entre duas chamadas» onde parar, por isso
   * o corte é por contagem e é feito antes de submeter.
   */
  it("o tecto corta antes de submeter, e por contagem", async () => {
    const { buscador, armazem } = mundo();
    const extractor = extractorDeLote();

    const r = await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
      tectoCustoUsd: 0.25,
      custoEsperadoPorChamadaUsd: 0.1,
    });

    // floor(0,25 / 0,10) = 2.
    expect(extractor.preparados).toHaveLength(2);
    expect(r.metricas.chamadasModelo).toBe(2);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(3);
  });

  it("um tecto sem custo esperado não submete nada", async () => {
    // Em dúvida, não passa. Um orçamento que não sabe converter dinheiro em
    // documentos não foi respeitado por se adivinhar quantos cabem.
    const { buscador, armazem } = mundo();
    const extractor = extractorDeLote();

    const r = await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
      tectoCustoUsd: 10,
    });

    expect(extractor.lotes).toBe(0);
    expect(r.metricas.chamadasModelo).toBe(0);
    expect(r.metricas.extraccoesAdiadasPorTecto).toBe(5);
  });

  it("o que o tecto deixou de fora é tentado na corrida seguinte", async () => {
    const { buscador, armazem } = mundo();

    await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor: extractorDeLote(),
      agora: AGORA,
      tectoCustoUsd: 0.25,
      custoEsperadoPorChamadaUsd: 0.1,
    });

    const segundo = extractorDeLote();
    const r = await executarFonte({
      fonte: fonteCinco,
      buscador,
      armazem,
      extractor: segundo,
      agora: AGORA,
    });

    expect(segundo.preparados).toHaveLength(3);
    expect(r.metricas.chamadasModelo).toBe(3);
  });
});

describe("quantosCabemNoTecto", () => {
  it("sem tecto cabem todos", () => {
    expect(quantosCabemNoTecto(103, undefined, 0.06)).toBe(103);
    expect(quantosCabemNoTecto(103, undefined, undefined)).toBe(103);
  });

  it("divide o tecto pelo custo esperado, arredondando para baixo", () => {
    expect(quantosCabemNoTecto(103, 10, 0.06)).toBe(103);
    expect(quantosCabemNoTecto(103, 1, 0.06)).toBe(16);
    expect(quantosCabemNoTecto(5, 10, 0.06)).toBe(5);
  });

  it("sem custo esperado, ou com um absurdo, não passa nada", () => {
    expect(quantosCabemNoTecto(103, 10, undefined)).toBe(0);
    expect(quantosCabemNoTecto(103, 10, 0)).toBe(0);
    expect(quantosCabemNoTecto(103, 10, -1)).toBe(0);
  });

  it("um tecto que não chega para uma chamada não deixa passar meia", () => {
    expect(quantosCabemNoTecto(103, 0.01, 0.06)).toBe(0);
  });
});

/**
 * O `--dry-run` tem de responder à pergunta que se lhe faz.
 *
 * Exercita a busca e os dois portões, não escreve nada e não chama o modelo.
 * Antes disto dizia «zero chamadas ao modelo», que é verdade e não responde a
 * «quantos documentos é que a corrida a sério ia pagar» — que é a única razão
 * para se correr a seco antes de gastar.
 */
describe("simulação", () => {
  const B = "https://portugal2030.pt";
  const L = `${B}/avisos/`;
  const urls = [1, 2, 3].map((n) => `${B}/aviso-${n}/`);

  const fonteTres: Fonte = {
    id: "pt2030-avisos",
    nome: "Portugal 2030 — Avisos",
    entidade: "Agência para o Desenvolvimento e Coesão",
    urlBase: B,
    urlsEntrada: [L],
    tipo: "listagem",
    cadenciaHoras: 24,
    estado: "activa",
    candidatosMin: 1,
    extrair: () =>
      urls.map((u, i) => ({
        titulo: `Aviso ${i + 1}`,
        urlDetalhe: u,
        urlCanonica: u,
        referenciaLegalBruta: null,
        dataBruta: null,
        tipoDocumento: "html" as const,
      })),
  };

  function mundo(): { buscador: BuscadorMemoria; armazem: ArmazemMemoria } {
    let buscador = new BuscadorMemoria().definir(L, {
      corpo: "<html><body>listagem</body></html>",
    });
    for (const [i, u] of urls.entries()) {
      buscador = buscador.definir(u, {
        corpo: `<html><body><main><p>Aviso ${i + 1}.</p></main></body></html>`,
      });
    }
    return { buscador, armazem: new ArmazemMemoria() };
  }

  it("conta os documentos que a corrida a sério pagaria, e não paga nenhum", async () => {
    const { buscador, armazem } = mundo();
    let chamadas = 0;
    const extractor: ExtractorLike = {
      async extrair(doc) {
        chamadas++;
        return extractorFixo().extrair(doc);
      },
    };

    const r = await executarFonte({
      fonte: fonteTres,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
      simulacao: true,
    });

    expect(r.metricas.documentosMudados).toBe(3);
    expect(r.metricas.chamadasModelo).toBe(0);
    expect(chamadas).toBe(0);
    expect(r.metricas.custoUsd).toBe(0);
    // E não escreveu nada: a corrida a sério a seguir continua a ver três.
    expect(armazem.apoios.size).toBe(0);
  });

  it("a seco, um extractor de lote não chega a submeter", async () => {
    const { buscador, armazem } = mundo();
    let lotes = 0;
    const extractor: ExtractorLike = {
      async prepararLote() {
        lotes++;
      },
      async extrair(doc) {
        return extractorFixo().extrair(doc);
      },
    };

    const r = await executarFonte({
      fonte: fonteTres,
      buscador,
      armazem,
      extractor,
      agora: AGORA,
      simulacao: true,
    });

    expect(lotes).toBe(0);
    expect(r.metricas.documentosMudados).toBe(3);
  });

  it("numa corrida a sério, os que mudaram são os que se pagam", async () => {
    const { buscador, armazem } = mundo();
    const r = await executarFonte({
      fonte: fonteTres,
      buscador,
      armazem,
      extractor: extractorFixo(),
      agora: AGORA,
    });

    expect(r.metricas.documentosMudados).toBe(3);
    expect(r.metricas.chamadasModelo).toBe(3);
  });
});
