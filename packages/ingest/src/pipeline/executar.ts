import {
  codigosDeAvisoNoTexto,
  construirChaves,
  diferenciar,
  prefixoPerdidoNaReferencia,
  resolverIdentidade,
  type Apoio,
  type ApoioNovo,
  type Candidato,
  type EventoApoio,
} from "@apoios/core";
import {
  decidir,
  extraccaoParaApoio,
  verificarProvas,
  type ExtractorLike,
  type DocumentoEntrada,
} from "@apoios/extraction";
import type { Buscador, PedidoCondicional, RespostaHttp } from "../http/tipos.ts";
import {
  decodificarEntidades,
  hashBytes,
  hashConteudo,
  normalizarConteudo,
} from "../http/normalizar.ts";
import type { Fonte, Paginacao } from "../sources/tipos.ts";
import type { Armazem } from "./armazem.ts";
import type { MetricasFonte } from "./saude.ts";
import { textoDoPdf } from "./pdf.ts";
import {
  atingiuOTecto,
  chaveDePagina,
  corpoDaPagina,
  haMaisPaginas,
  TENTATIVAS_POR_PAGINA,
} from "./paginacao.ts";

/**
 * Uma entrada por visitar nesta corrida.
 *
 * O que a distingue de um `PedidoCondicional` é a `chaveSnapshot`: o endereço a
 * que se bate e a chave com que o resultado fica arrumado deixaram de ser a
 * mesma coisa, porque 46 páginas do PT2030 partilham um URL e precisavam de 46
 * chaves. Numa entrada não paginada as duas coincidem, e nada muda.
 */
interface EntradaDeCorrida extends PedidoCondicional {
  readonly chaveSnapshot: string;
  readonly paginacao?: Paginacao;
  /** Presente só numa entrada paginada. É o valor enviado no parâmetro. */
  readonly pagina?: number;
}

export interface OpcoesExecucao {
  readonly fonte: Fonte;
  readonly buscador: Buscador;
  readonly armazem: Armazem;
  readonly extractor: ExtractorLike;
  readonly agora: Date;
  /**
   * Safety rail against a runaway listing. NOT a budget.
   *
   * It was 25, and that quietly cost the product its whole subject. The Fundo
   * Ambiental listing yields 47 candidates and this took the first 25 in document
   * order, so the `c13 — eficiência energética em edifícios` section never got
   * fetched: PAE+S, Vale Eficiência, E-Lar, Condomínios Residenciais, Bairros Mais
   * Sustentáveis. Every household scheme the app exists to alert on, one link from
   * a page already in the pipeline, dropped by an off-by-a-round-number.
   *
   * The number was low because it was read as a cost control, and it is not one.
   * The costly step is the model call, and that is gated separately and much more
   * tightly: a candidate is fetched conditionally (etag/last-modified), hashed, and
   * only reaches the extractor when the content genuinely changed. Fetching 47
   * unchanged pages costs 47 conditional GETs and nothing else. This rail exists
   * only so a source that starts emitting thousands of links cannot run away with
   * a night, which is a different problem with a different right answer.
   */
  readonly maxDetalhes?: number;
  /**
   * Hard ceiling on what one run may spend on model calls, in US dollars.
   *
   * This is the budget that `maxDetalhes` is explicitly not. It is checked
   * against the cost of the calls already made, immediately before each new one,
   * and a run that reaches it stops calling the model and says so.
   *
   * Two properties worth knowing before trusting it:
   *
   * - **It can overshoot by one call.** The cost of a call is only known once the
   *   API has answered, so the check is on what has been spent, not on what the
   *   next call will cost. Measured average is $0.12 a call; set the ceiling with
   *   that much slack.
   * - **A refused document is not a lost one.** The snapshot is stored but never
   *   marked processed, and `snapshotAnterior` only counts processed snapshots —
   *   so the next run sees it as changed and tries again. Refusing is a delay,
   *   not a drop.
   *
   * Omitted means no ceiling, which is the right default for the nightly run: a
   * gate that stops halfway leaves the catalogue in a state nobody chose.
   */
  readonly tectoCustoUsd?: number;
  /**
   * What one model call is expected to cost, for a ceiling that must cut before
   * it can measure.
   *
   * Only read on the batched path, where the requests go out together and there
   * is no moment between two calls at which to stop. There the ceiling becomes a
   * count — `floor(tecto / esperado)` — and this is the divisor.
   *
   * It is an estimate, and naming it separately is how that stays visible. The
   * measured average over the 99 priced calls in `fund_extractions` is $0.1162 at
   * list price, so roughly $0.058 batched; a PDF costs more in input than the
   * HTML those were, so the honest use of this field is to pass a figure with
   * slack and correct it against `MetricasFonte.custoUsd` afterwards.
   *
   * Omitted while a ceiling is set means nothing is submitted, deliberately: a
   * budget that cannot convert money into documents has not been respected by
   * guessing.
   */
  readonly custoEsperadoPorChamadaUsd?: number;
  /** When true, nothing is written and no model call is made. */
  readonly simulacao?: boolean;
}

export interface ResultadoExecucao {
  readonly metricas: MetricasFonte;
  readonly apoiosNovos: readonly Apoio[];
  readonly apoiosActualizados: readonly Apoio[];
  readonly eventos: readonly EventoApoio[];
  readonly conflitos: readonly string[];
  readonly saltouPorNaoModificado: boolean;
}

/** Um documento buscado, comparado e gravado, à espera do modelo. */
interface Preparado {
  readonly candidato: Candidato;
  readonly hash: string;
  readonly doc: DocumentoEntrada;
}

/**
 * Quantos documentos cabem no tecto, contados antes de se saber o que custam.
 *
 * O tecto do caminho normal é conferido **depois** de cada chamada, contra o que
 * já se gastou — uma medição. Num lote isso é impossível: os pedidos vão todos de
 * uma vez e não há um «entre duas chamadas» onde parar. O corte passa a ser por
 * contagem, e a contagem precisa de um custo esperado por chamada, que é uma
 * estimativa.
 *
 * A diferença é real e não se deve esconder atrás do mesmo nome: com lote, o
 * tecto é respeitado **se a estimativa estiver certa**. O que a corrida gastou de
 * facto fica em `MetricasFonte.custoUsd`, medido, e é contra esse número que a
 * estimativa se corrige da próxima vez.
 *
 * Sem tecto pedido, cabem todos.
 */
export function quantosCabemNoTecto(
  disponiveis: number,
  tectoUsd: number | undefined,
  custoEsperadoUsd: number | undefined,
): number {
  if (tectoUsd === undefined) return disponiveis;
  // Sem custo esperado não há como converter dinheiro em documentos. Em dúvida,
  // não passa: zero, e o alarme do tecto diz quantos ficaram de fora.
  if (custoEsperadoUsd === undefined || custoEsperadoUsd <= 0) return 0;
  return Math.max(0, Math.min(disponiveis, Math.floor(tectoUsd / custoEsperadoUsd)));
}

/** `%PDF-`, os cinco bytes que a norma obriga a estar no início do ficheiro. */
function comecaPorPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function textoVisivel(html: string): string {
  return (
    decodificarEntidades(
      normalizarConteudo(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    )
      // Entities are decoded before the whitespace collapse, so a `&#160;` that
      // became a space is folded like any other.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Run one source end to end.
 *
 * The ordering matters and is not arbitrary: two change gates sit ahead of every
 * expensive step. The listing gate skips the whole source when nothing moved; the
 * per-candidate gate skips individual notices, which is the larger saving because
 * a listing page changes whenever any *one* of its forty entries does. Together
 * they are the difference between roughly $30 a month and roughly $600.
 */
/**
 * Resolve identity and write the fund, for a notice from any path.
 *
 * Shared by the model path and the dataset path so the two cannot drift. Identity
 * is the part of this pipeline where a mistake is worst and least visible: a wrong
 * merge inherits another fund's dedup ledger and silently stops that fund's
 * subscribers from ever being alerted, and nothing downstream reports it.
 */
async function resolverEPersistir(
  armazem: Armazem,
  fonte: Fonte,
  novo: ApoioNovo,
  entrada: { readonly referenciaLegal: string | null; readonly url: string },
): Promise<
  | { readonly tipo: "novo"; readonly apoio: Apoio; readonly anterior: null }
  | { readonly tipo: "existente"; readonly apoio: Apoio; readonly anterior: Apoio | null }
  | { readonly tipo: "conflito"; readonly apoio: Apoio; readonly conflito: string }
> {
  const chaves = construirChaves({
    sourceId: fonte.id,
    referenciaLegal: entrada.referenciaLegal,
    url: entrada.url,
    titulo: novo.titulo,
    anoAbertura: novo.abreEm.iso
      ? new Date(novo.abreEm.iso).getUTCFullYear()
      : null,
  });

  const existentes = await armazem.procurarIdentidades(
    chaves.map((c) => c.valor),
  );
  const resolucao = resolverIdentidade(chaves, existentes, {
    // A dataset row is a record, not a page. Two rows sharing a title share a
    // programme name, not an identity — see the annual plan, which lists the same
    // programme once per region.
    fundirPorTitulo: fonte.tipo !== "dataset",
  });

  if (resolucao.tipo === "novo") {
    return {
      tipo: "novo",
      apoio: await armazem.criarApoio(novo, chaves),
      anterior: null,
    };
  }

  if (resolucao.tipo === "conflito") {
    // Never merge. A wrong merge inherits the other fund's filled dedup ledger
    // and silently stops that fund's subscribers from being alerted at all.
    const bloqueado = {
      ...novo,
      needsReview: true,
      alertavel: false,
      motivoRevisao: [...novo.motivoRevisao, "conflito_identidade"],
    };
    return {
      tipo: "conflito",
      apoio: await armazem.actualizarApoio(resolucao.fundId, bloqueado),
      conflito: `${novo.titulo}: chaves apontam para ${resolucao.fundIdsEmConflito.join(", ")}`,
    };
  }

  const anterior = await armazem.obterApoio(resolucao.fundId);
  await armazem.registarIdentidades(resolucao.fundId, resolucao.chavesEmFalta);
  return {
    tipo: "existente",
    apoio: await armazem.actualizarApoio(resolucao.fundId, novo),
    anterior,
  };
}

export async function executarFonte(
  op: OpcoesExecucao,
): Promise<ResultadoExecucao> {
  const inicio = Date.now();
  const { fonte, buscador, armazem, extractor, agora } = op;

  let bytesTotais = 0;
  let statusFinal = 0;
  let erro: string | null = null;
  const candidatos: Candidato[] = [];

  // --- 1-3. Listing fetch, conditional GET, change gate -----------------------
  let listagemInalterada = true;

  // Apoios que vieram directamente da resposta de entrada, sem listagem pelo meio.
  //
  // Recolhidos aqui e resolvidos na secção 6, ao lado dos que vêm de uma folha:
  // é o mesmo trabalho — identidade, persistência, eventos — e fazê-lo duas vezes
  // era convidar as duas cópias a divergirem.
  const apoiosDaEntrada: ApoioNovo[] = [];

  // `urlsEntrada` são GETs simples; `pedidosEntrada` são os que não são.
  //
  // Uma entrada paginada entra aqui como a sua primeira página, e as seguintes
  // são acrescentadas à medida que cada uma rende. É por isso uma fila que se
  // consome, e não um `for` sobre um array fixo: quantas páginas existem só se
  // sabe ao chegar à primeira que vem vazia.
  const porVisitar: EntradaDeCorrida[] = [
    ...fonte.urlsEntrada.map((url) => ({ url, chaveSnapshot: url })),
    ...(fonte.pedidosEntrada ?? []).map((p) =>
      p.paginacao === undefined
        ? { ...p, chaveSnapshot: p.url }
        : {
            ...p,
            pagina: p.paginacao.primeiraPagina,
            corpo: corpoDaPagina(p.corpo, p.paginacao, p.paginacao.primeiraPagina),
            chaveSnapshot: chaveDePagina(p.url, p.paginacao.primeiraPagina),
          },
    ),
  ];

  while (porVisitar.length > 0) {
    const entrada = porVisitar.shift() as EntradaDeCorrida;
    const url = entrada.url;
    // O endereço a que se bate e a chave com que se arruma deixaram de ser a
    // mesma coisa. Numa entrada não paginada continuam a coincidir.
    const chave = entrada.chaveSnapshot;
    const anterior = await armazem.snapshotAnterior(chave);
    const pedirPagina = (): Promise<RespostaHttp> =>
      buscador.buscar({
        url: entrada.url,
        metodo: entrada.metodo,
        corpo: entrada.corpo,
        tipoConteudo: entrada.tipoConteudo,
        etag: anterior?.etag ?? null,
        lastModified: anterior?.lastModified ?? null,
      });

    let resposta = await pedirPagina();

    // Numa entrada paginada, uma falha de rede não é só esta página que se
    // perde: é o resto do varrimento. A página seguinte é enfileirada mais
    // abaixo, depois do `continue` que um erro dispara, por isso um `timeout`
    // a meio pára o ciclo como se o conjunto tivesse acabado — só que sem o
    // sentinela e sem ninguém ter decidido isso.
    //
    // Isto não é hipótese: o primeiro varrimento a sério morreu na página 44
    // de 46 assim. Só nas entradas paginadas, de propósito — numa entrada
    // normal uma falha custa essa fonte nesta corrida, e o comportamento de
    // cinco fontes não se muda de passagem por causa de uma.
    if (resposta.erro !== null && entrada.paginacao !== undefined) {
      for (let t = 1; t < TENTATIVAS_POR_PAGINA && resposta.erro !== null; t++) {
        resposta = await pedirPagina();
      }
    }

    statusFinal = resposta.status;

    if (resposta.erro !== null) {
      erro = resposta.erro;
      continue;
    }

    // A 200 that is really an error page must not be mistaken for healthy content.
    // Caught here rather than in the extractor so it registers as a run error and
    // trips the health rules, instead of looking like a quiet week.
    if (
      !resposta.naoModificado &&
      resposta.corpo !== null &&
      fonte.ehPaginaDeErro?.(resposta.corpo, resposta.url) === true
    ) {
      erro = `pagina de erro servida com HTTP ${resposta.status}: ${resposta.url}`;
      continue;
    }

    // Hash the *normalised* body: __VIEWSTATE alone would otherwise make every
    // fetch of an unchanged page look like a change.
    const corpo = resposta.naoModificado ? null : resposta.corpo;
    const hash = corpo === null ? null : hashConteudo(corpo);
    const mudou = corpo !== null && anterior?.hashConteudo !== hash;

    if (corpo !== null)
      bytesTotais += resposta.bytes?.byteLength ?? corpo.length;

    if (mudou) {
      listagemInalterada = false;
      if (!op.simulacao && hash !== null) {
        await armazem.guardarSnapshot(
          chave,
          {
            hashConteudo: hash,
            etag: resposta.etag,
            lastModified: resposta.lastModified,
            capturadoEm: agora.toISOString(),
          },
          new TextEncoder().encode(normalizarConteudo(corpo)),
        );
        // A listing is finished the moment it is stored: parsing it is local,
        // free, and happens unconditionally a few lines below. Nothing
        // downstream can fail in a way that should make us read it again.
        await armazem.marcarProcessado(chave, hash);
      }
    }

    // --- 5. Deterministic candidate extraction (pure, fixture-tested) ---------
    // Parse even when the listing did not change, falling back to the stored
    // snapshot. Parsing is local and free; the expensive steps (detail fetch and
    // the model call) have their own gates below. Skipping the source outright on
    // an unchanged listing would miss a deadline extended only on the detail page.
    let html = corpo;
    if (html === null) {
      const guardado = await armazem.conteudoSnapshot(chave);
      html =
        guardado === null ? null : new TextDecoder("utf-8").decode(guardado);
    }
    // Uma fonte cuja entrada já É o conjunto de dados não tem listagem para
    // analisar. Ler o corpo como markup e passá-lo ao `extrair` daria zero
    // candidatos e um silêncio que se confundiria com uma semana parada.
    if (fonte.entradaEDataset === true && fonte.lerDataset !== undefined) {
      let rendeu = 0;
      if (html !== null) {
        const apoios = fonte.lerDataset(new TextEncoder().encode(html), {
          // A página humana, não a chave: `urlOrigem` é para onde se manda um
          // leitor, e `?_pagina=3` não é sítio nenhum.
          urlOrigem: url,
          entidade: fonte.entidade,
        });
        rendeu = apoios.length;
        apoiosDaEntrada.push(...apoios);

        // A mesma resposta responde a duas perguntas. O que ela já diz vira
        // apoio aqui; o que ela só nomeia — os PDFs dos avisos, onde vivem as
        // medidas e os beneficiários — vira candidato, e segue pelo caminho de
        // detalhe normal, com o portão da mudança e o tecto de custo pelo meio.
        if (fonte.candidatosDoDataset !== undefined) {
          candidatos.push(
            ...fonte.candidatosDoDataset(new TextEncoder().encode(html), {
              urlOrigem: url,
              entidade: fonte.entidade,
            }),
          );
        }
      }

      const p = entrada.paginacao;
      if (p !== undefined && entrada.pagina !== undefined) {
        if (atingiuOTecto(rendeu, entrada.pagina, p)) {
          // Alto, porque a alternativa é um varrimento truncado que se parece
          // exactamente com um varrimento completo.
          console.warn(
            `[${fonte.id}] tecto de ${p.maxPaginas} páginas atingido com a ` +
              `página ${entrada.pagina} ainda a render ${rendeu} apoios. ` +
              `O varrimento está truncado: ou a fonte cresceu, ou o sentinela ` +
              `de fim mudou.`,
          );
        } else if (haMaisPaginas(rendeu, entrada.pagina, p)) {
          const seguinte = entrada.pagina + 1;
          porVisitar.push({
            ...entrada,
            pagina: seguinte,
            corpo: corpoDaPagina(entrada.corpo ?? "", p, seguinte),
            chaveSnapshot: chaveDePagina(url, seguinte),
          });
        }
      }
      continue;
    }

    if (html !== null) {
      candidatos.push(
        ...fonte.extrair(html, { urlBase: fonte.urlBase, agora }),
      );
    }
  }

  const saltou = listagemInalterada && erro === null;

  // --- 6. Per-candidate change gate ------------------------------------------
  const apoiosNovos: Apoio[] = [];
  const apoiosActualizados: Apoio[] = [];
  const eventos: EventoApoio[] = [];
  const conflitos: string[] = [];
  let extraccoesOk = 0;
  let extraccoesRevisao = 0;
  let extraccoesFalhadas = 0;
  const errosExtraccao = new Set<string>();
  let provasFalhadas = 0;
  let tokensCacheLidos = 0;
  let chamadasModelo = 0;
  let custoUsd = 0;
  let extraccoesAdiadasPorTecto = 0;
  let documentosQueNaoSaoPdf = 0;
  let documentosMudados = 0;
  // Um modelo sem preço fixado em `PRECOS` fecha o tecto. Ver abaixo.
  let precoEmFalta = false;

  /**
   * O que foi buscado, comparado e gravado, e está à espera do modelo.
   *
   * Existe porque a API de lotes precisa de todos os pedidos de uma vez. Guarda
   * os bytes do documento enquanto espera — cerca de 70 MB para os avisos do
   * PT2030 —, que é o preço de os pedir juntos em vez de um a um.
   */
  let preparados: Preparado[] = [];

  const limite = op.maxDetalhes ?? 250;
  const ignorados = Math.max(0, candidatos.length - limite);
  if (ignorados > 0) {
    // Loud, because the previous truncation was silent for the entire life of the
    // project and nothing in the run summary, the health rules or the database
    // gave any sign that a document had been skipped rather than found unchanged.
    console.warn(
      `[${fonte.id}] ${candidatos.length} candidatos, limite ${limite}: ` +
        `${ignorados} ignorados. Uma listagem maior que o limite é sinal de que ` +
        `o limite está errado, não de que a listagem está.`,
    );
  }


  // Os apoios que vieram da própria resposta de entrada, resolvidos com o mesmo
  // caminho que os da folha: identidade, persistência, eventos.
  //
  // Sem linha em `fund_extractions`, e pela mesma razão que a folha: essa tabela
  // regista o que um modelo foi perguntado e o que respondeu, e aqui não se
  // perguntou nada a modelo nenhum. Uma linha com modelo nulo tornava a tabela um
  // sítio onde umas entradas querem dizer «o modelo disse» e outras «uma coluna
  // dizia», e distinguir as duas é a razão de ela existir.
  for (const novo of apoiosDaEntrada) {
    const r = await resolverEPersistir(armazem, fonte, novo, {
      referenciaLegal: novo.referenciaLegal,
      url: novo.urlOficial,
    });

    if (r.tipo === "novo") {
      apoiosNovos.push(r.apoio);
      eventos.push(...diferenciar(null, r.apoio, agora.toISOString()));
    } else if (r.tipo === "conflito") {
      conflitos.push(r.conflito);
      apoiosActualizados.push(r.apoio);
    } else {
      apoiosActualizados.push(r.apoio);
      eventos.push(...diferenciar(r.anterior, r.apoio, agora.toISOString()));
    }
  }

  for (const candidato of candidatos.slice(0, limite)) {
    const anterior = await armazem.snapshotAnterior(candidato.urlDetalhe);
    const resposta = await buscador.buscar({
      url: candidato.urlDetalhe,
      etag: anterior?.etag ?? null,
      lastModified: anterior?.lastModified ?? null,
    });

    if (resposta.erro !== null || resposta.naoModificado) continue;

    // --- 6b. Spreadsheets: read directly, no model call ----------------------
    //
    // Left to fall through, a .xlsx would be decoded as if it were text and sent
    // to the model as mojibake — a paid call whose output could only be nonsense.
    // Until now the guard against that was a bare `continue` and a comment saying
    // spreadsheets were handled by their own parser. The parser existed, was
    // tested, read all 211 planned notices — and nothing ever called it. The
    // source has been `activa` and discarding its only candidate on every run
    // since it was added.
    if (candidato.tipoDocumento === "folha") {
      const bytes = resposta.bytes;
      if (bytes == null || fonte.lerDataset === undefined) continue;

      const hashFolha = hashBytes(bytes);
      if (anterior?.hashConteudo === hashFolha) continue;
      if (op.simulacao) continue;

      await armazem.guardarSnapshot(
        candidato.urlDetalhe,
        {
          hashConteudo: hashFolha,
          etag: resposta.etag,
          lastModified: resposta.lastModified,
          capturadoEm: agora.toISOString(),
        },
        bytes,
      );

      for (const novo of fonte.lerDataset(bytes, {
        // The page the file hangs off, not the file: that is what a reader should
        // be sent to, and it is what stays valid when the plan is re-published
        // under a new filename.
        urlOrigem: fonte.urlsEntrada[0] ?? candidato.urlDetalhe,
        entidade: fonte.entidade,
      })) {
        const r = await resolverEPersistir(armazem, fonte, novo, {
          referenciaLegal: novo.referenciaLegal,
          url: novo.urlOficial,
        });

        if (r.tipo === "novo") {
          apoiosNovos.push(r.apoio);
          eventos.push(...diferenciar(null, r.apoio, agora.toISOString()));
        } else if (r.tipo === "conflito") {
          conflitos.push(r.conflito);
          apoiosActualizados.push(r.apoio);
        } else {
          apoiosActualizados.push(r.apoio);
          eventos.push(
            ...diferenciar(r.anterior, r.apoio, agora.toISOString()),
          );
        }
      }

      // No `fund_extractions` row, deliberately: that table records what a model
      // was asked and what it answered, and nothing here was asked of a model.
      // Writing a row with a null model would make the extraction log a place
      // where some entries mean "the model said so" and others mean "a column
      // said so" — and the whole point of that table is telling those apart.
      await armazem.marcarProcessado(candidato.urlDetalhe, hashFolha);
      continue;
    }

    const ehPdf = candidato.tipoDocumento === "pdf" || resposta.corpo === null;

    // Um PDF que não começa por `%PDF-` não é um PDF, e nada a jusante o vai
    // descobrir sozinho.
    //
    // O PT2030 anuncia documentos cujo blob já não existe, e o Azure responde
    // **HTTP 200** com 215 bytes de XML `BlobNotFound` — medido no
    // `NORTE2030-2024-80`, três tentativas, três vezes o mesmo. Nem o código de
    // estado nem o hash denunciam, que é a mesma armadilha do `erro-aspx-200.html`.
    // Sem esta guarda, 215 bytes de XML iam para a API dentro de um bloco
    // `document` a dizer `application/pdf`.
    //
    // Sem `marcarProcessado`, de propósito: o ficheiro pode voltar, e a corrida
    // seguinte volta a tentar. Uma descarga de 215 bytes por noite é mais barata
    // do que decidir por ele que desapareceu para sempre.
    if (ehPdf && resposta.bytes !== null && !comecaPorPdf(resposta.bytes)) {
      documentosQueNaoSaoPdf++;
      console.warn(
        `[${fonte.id}] ${candidato.urlDetalhe} devolveu ${resposta.bytes.length} ` +
          `bytes que não começam por %PDF- (HTTP ${resposta.status}). ` +
          `Não vai ao modelo.`,
      );
      continue;
    }

    const hash = ehPdf
      ? resposta.bytes
        ? hashBytes(resposta.bytes)
        : null
      : hashConteudo(resposta.corpo ?? "");

    if (hash === null || anterior?.hashConteudo === hash) continue;

    const texto = ehPdf
      ? // A PDF's text layer is only needed so evidence quotes can be verified;
        // the model still receives the original bytes.
        textoDoPdf(resposta.bytes)
      : textoVisivel(resposta.corpo ?? "");

    // Contado antes do desvio da simulação, e é isso que torna o `--dry-run`
    // útil: sem este número uma corrida a seco dizia «zero chamadas ao modelo»,
    // que é verdade e não responde à única pergunta que se lhe faz — quantos
    // documentos é que a corrida a sério ia pagar.
    documentosMudados++;

    if (op.simulacao) {
      // Dry run stops here: the fetch and both gates are exercised, but nothing
      // is written and no paid model call is made.
      continue;
    }

    await armazem.guardarSnapshot(
      candidato.urlDetalhe,
      {
        hashConteudo: hash,
        etag: resposta.etag,
        lastModified: resposta.lastModified,
        capturadoEm: agora.toISOString(),
      },
      resposta.bytes ?? new TextEncoder().encode(texto),
    );

    preparados.push({
      candidato,
      hash,
      doc: {
        urlFonte: candidato.urlDetalhe,
        entidade: fonte.entidade,
        dataRecolha: agora.toISOString().slice(0, 10),
        texto,
        pdf: ehPdf ? (resposta.bytes ?? undefined) : undefined,
      },
    });
  }

  // --- 6d. Preparar o lote, se o extractor souber -----------------------------
  //
  // É aqui que o ciclo se parte em dois, e é a única razão para ele estar
  // partido. A API de lotes só existe no plural: os pedidos vão todos juntos e a
  // resposta chega mais tarde, a metade do preço. Com um extractor que não sabe
  // fazer lotes isto não faz nada e as duas metades correm de seguida, como
  // sempre correram.
  //
  // O tecto corta **antes** de submeter, e por contagem, porque depois de
  // submeter já não há onde parar. É a diferença de semântica que o
  // `custoEsperadoPorChamadaUsd` existe para tornar visível.
  if (extractor.prepararLote !== undefined) {
    const cabem = quantosCabemNoTecto(
      preparados.length,
      op.tectoCustoUsd,
      op.custoEsperadoPorChamadaUsd,
    );
    extraccoesAdiadasPorTecto += preparados.length - cabem;
    preparados = preparados.slice(0, cabem);
    if (preparados.length > 0) {
      await extractor.prepararLote(preparados.map((p) => p.doc));
    }
  }

  // --- 7. Model extraction, only on genuinely changed documents --------------
  for (const { candidato, hash, doc } of preparados) {
    const texto = doc.texto;
    // O tecto é conferido aqui, e não antes da descarga: só se sabe que um
    // documento precisa de uma chamada depois de ele ser buscado e comparado. O
    // que se perde por estar aqui é a descarga; o que se ganharia por estar antes
    // era gastar o orçamento no primeiro candidato da lista em vez de no primeiro
    // que mudou.
    //
    // Com lote isto nunca dispara: o corte já foi feito acima, por contagem.
    if (
      op.tectoCustoUsd !== undefined &&
      extractor.prepararLote === undefined &&
      (precoEmFalta || custoUsd >= op.tectoCustoUsd)
    ) {
      extraccoesAdiadasPorTecto++;
      continue;
    }

    chamadasModelo++;
    const resultado = await extractor.extrair(doc);

    tokensCacheLidos += resultado.tokensCacheLidos;

    if (op.tectoCustoUsd !== undefined && resultado.custoUsd === null) {
      // Um modelo sem preço fixado em `PRECOS` não se consegue somar, e um
      // orçamento que não sabe quanto já gastou não é um orçamento. Pára, em vez
      // de continuar a gastar às cegas — é a mesma regra do portão: em dúvida,
      // não passa. A alternativa, tratar o desconhecido como zero, deixava o
      // tecto por atingir para sempre e era precisamente a avaria silenciosa.
      precoEmFalta = true;
      errosExtraccao.add(
        `modelo ${resultado.modelo} sem preço em PRECOS: o tecto de custo não ` +
          `se consegue respeitar, corrida interrompida`,
      );
    } else {
      custoUsd += resultado.custoUsd ?? 0;
    }

    if (resultado.extraccao === null) {
      // Not a review: the call produced nothing. `cliente.ts` already knows why —
      // a refusal, a response without structured output, or a thrown request
      // error — and dropping that here left the run with no way to say what went
      // wrong. Deduplicated because thirty identical messages are one fact.
      extraccoesFalhadas++;
      errosExtraccao.add(resultado.erro ?? "sem erro reportado");
      continue;
    }

    // The document has now been extracted, so its snapshot stops being a retry
    // candidate. Deliberately before verification and not after: failing the
    // evidence gate is a fact about the document, not a transient error, and
    // re-running the same text through the same prompt would only buy the same
    // answer at the same price. Only a call that produced *nothing* is retried.
    await armazem.marcarProcessado(candidato.urlDetalhe, hash);

    // --- 8. Verification, gating, normalisation ------------------------------
    const verificacao = verificarProvas(resultado.extraccao, texto);
    if (verificacao.provaFalhou.length > 0) provasFalhadas++;

    const decidida = decidir(
      resultado.extraccao,
      verificacao,
      resultado.stopReason,
      agora.toISOString().slice(0, 10),
    );

    // Um documento pode anunciar vários avisos, e daqui só sai um apoio.
    //
    // Um artigo é um candidato, é uma extracção, é **um** `ApoioNovo`. Quando o
    // artigo anuncia seis — o do Centro 2030 anuncia `Centro2030-2024-47` a `-52`,
    // e o dos Açores anuncia três — cinco não existem em lado nenhum. Medido a
    // 17/09/2026: nenhum dos nove códigos desses dois artigos está no endpoint de
    // avisos abertos, por isso não entram por outra via.
    //
    // Isto não repara a sub-contagem: repará-la é mudar a forma, ou a fonte a
    // render um candidato por aviso, ou o esquema a admitir vários. O que faz é
    // pará-la de ser silenciosa. Um apoio que representa seis avisos passa a
    // chegar a um humano marcado como tal, em vez de se confundir com um que
    // representa um só.
    //
    // Não mexe no `publicado` nem no `alertavel`, de propósito: o aviso que **foi**
    // capturado está tão certo como estava, e escondê-lo perdia mais do que ganha.
    const codigos = codigosDeAvisoNoTexto(texto);
    const decisao =
      codigos.length <= 1
        ? decidida
        : {
            ...decidida,
            needsReview: true,
            motivoRevisao: [
              ...decidida.motivoRevisao,
              `avisos_por_capturar:${codigos.length - 1}`,
            ],
          };

    if (codigos.length > 1) {
      console.warn(
        `[${fonte.id}] ${candidato.urlDetalhe} anuncia ${codigos.length} avisos ` +
          `(${codigos.join(", ")}) e rende um apoio. ` +
          `${codigos.length - 1} ficam por capturar.`,
      );
    }

    if (decisao.needsReview) extraccoesRevisao++;
    else extraccoesOk++;

    const novo = extraccaoParaApoio(resultado.extraccao, decisao, {
      sourceId: fonte.id,
      urlOficial: candidato.urlDetalhe,
      anoPredefinido: agora.getUTCFullYear(),
    });

    // --- 9. Identity resolution ---------------------------------------------
    //
    // A referência só entra na identidade se o documento não a desmentir.
    //
    // A chave `referencia_legal` é a mais forte que existe (100), e uma que nomeie
    // um número sem a região funde dois avisos de regiões diferentes num só — o
    // apoio que desaparece não deixa rasto. Na `pt2030-avisos` isso não é
    // hipotético: a extracção é por modelo sobre texto de artigos, e o que ela
    // grava é `2024-47` para um aviso que o artigo escreve `Centro2030-2024-47`.
    //
    // O prefixo perde-se antes de a canonicalização lhe tocar, por isso não há
    // correcção àquela função que o recupere. O que se pode fazer aqui, sem rede e
    // sem modelo, é perguntar ao próprio documento: escreves um código mais longo
    // cuja cauda é esta? Se escreves, o que o modelo devolveu está truncado.
    //
    // E aí a referência não entra. Cai-se para o `url_canonica` (70), que é a
    // mesma troca que o #76 fez na listagem: uma fusão que não acontece é uma
    // linha a mais no catálogo; uma chave que colide é uma linha a menos, em
    // silêncio. Reparar com o código completo era tentador e é outra decisão —
    // esta falha fechada, como todas as outras deste portão.
    const refDeclarada = novo.referenciaLegal ?? candidato.referenciaLegalBruta;
    const codigoCompleto = prefixoPerdidoNaReferencia(refDeclarada, texto);
    if (codigoCompleto !== null) {
      // Alto, porque isto é uma extracção a perder informação que o documento
      // tem — e o sítio onde se corrige é o prompt, não aqui.
      console.warn(
        `[${fonte.id}] referência truncada em ${candidato.urlDetalhe}: ` +
          `o modelo devolveu ${JSON.stringify(refDeclarada)} e o documento ` +
          `escreve ${JSON.stringify(codigoCompleto)}. Não entra na identidade.`,
      );
    }

    const resolucao = await resolverEPersistir(armazem, fonte, novo, {
      referenciaLegal: codigoCompleto === null ? refDeclarada : null,
      url: candidato.urlDetalhe,
    });

    // The audit trail, written for every extraction that produced a value —
    // including the ones whose evidence failed. Those are precisely the ones worth
    // reading later: without them, "every quote was rejected" is a dead end.
    const registar = async (fundId: string | null): Promise<void> => {
      if (op.simulacao) return;
      await armazem.guardarExtraccao({
        fundId,
        modelo: resultado.modelo,
        versaoPrompt: resultado.versaoPrompt,
        versaoEsquema: resultado.versaoEsquema,
        bruto: resultado.extraccao,
        confiancaCampos: Object.fromEntries(verificacao.confiancaEfectiva),
        evidenciaFalhou: verificacao.provaFalhou,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
        tokensCacheLidos: resultado.tokensCacheLidos,
        tokensCacheEscritos: resultado.tokensCacheEscritos,
        custoUsd: resultado.custoUsd,
        stopReason: resultado.stopReason,
      });
    };

    // --- 10. Diff into events ------------------------------------------------
    await registar(resolucao.apoio.id);

    if (resolucao.tipo === "novo") {
      apoiosNovos.push(resolucao.apoio);
      eventos.push(...diferenciar(null, resolucao.apoio, agora.toISOString()));
      continue;
    }

    if (resolucao.tipo === "conflito") {
      conflitos.push(resolucao.conflito);
      apoiosActualizados.push(resolucao.apoio);
      continue;
    }

    apoiosActualizados.push(resolucao.apoio);
    eventos.push(
      ...diferenciar(resolucao.anterior, resolucao.apoio, agora.toISOString()),
    );
  }

  // --- 11. Idempotent event insert -------------------------------------------
  if (!op.simulacao && eventos.length > 0) {
    await armazem.registarEventos(eventos);
  }

  return {
    metricas: {
      sourceId: fonte.id,
      httpStatus: statusFinal,
      bytes: bytesTotais,
      duracaoMs: Date.now() - inicio,
      // Numa fonte cuja entrada já é o conjunto de dados, o número que quer dizer
      // «isto funcionou» são os apoios que a resposta rendeu, não os candidatos —
      // que são sempre zero, porque não há listagem por onde passar.
      //
      // Contado aqui, e não num campo novo, porque é a mesma pergunta: o piso de
      // saúde existe para distinguir uma fonte que produziu pouco de uma que
      // partiu, e com `candidatos.length` fixo em zero essa pergunta ficava sem
      // resposta possível — um piso que dispara sempre ensina a ignorá-lo, que é
      // pior do que não ter piso nenhum.
      candidatos:
        fonte.entradaEDataset === true
          ? apoiosDaEntrada.length
          : candidatos.length,
      candidatosIgnorados: ignorados,
      // Estes apoios trazem as datas em campos próprios, já verificadas pelo
      // `lerDataset`. A regra do «analisa mas perdeu as datas» é sobre uma
      // listagem cujo selector de data partiu, e aqui não há selector nenhum.
      candidatosComData:
        fonte.entradaEDataset === true
          ? apoiosDaEntrada.filter((a) => a.fechaEm.iso !== null).length
          : candidatos.filter((c) => c.dataBruta !== null).length,
      extraccoesOk,
      extraccoesRevisao,
      extraccoesFalhadas,
      errosExtraccao: [...errosExtraccao],
      provasFalhadas,
      tokensCacheLidos,
      chamadasModelo,
      custoUsd,
      extraccoesAdiadasPorTecto,
      documentosQueNaoSaoPdf,
      documentosMudados,
      erro,
    },
    apoiosNovos,
    apoiosActualizados,
    eventos,
    conflitos,
    saltouPorNaoModificado: saltou,
  };
}
