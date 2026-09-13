import {
  construirChaves,
  diferenciar,
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
} from "@apoios/extraction";
import type { Buscador } from "../http/tipos.ts";
import {
  decodificarEntidades,
  hashBytes,
  hashConteudo,
  normalizarConteudo,
} from "../http/normalizar.ts";
import type { Fonte } from "../sources/tipos.ts";
import type { Armazem } from "./armazem.ts";
import type { MetricasFonte } from "./saude.ts";

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
  const resolucao = resolverIdentidade(chaves, existentes);

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

  for (const url of fonte.urlsEntrada) {
    const anterior = await armazem.snapshotAnterior(url);
    const resposta = await buscador.buscar({
      url,
      etag: anterior?.etag ?? null,
      lastModified: anterior?.lastModified ?? null,
    });

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
          url,
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
        await armazem.marcarProcessado(url, hash);
      }
    }

    // --- 5. Deterministic candidate extraction (pure, fixture-tested) ---------
    // Parse even when the listing did not change, falling back to the stored
    // snapshot. Parsing is local and free; the expensive steps (detail fetch and
    // the model call) have their own gates below. Skipping the source outright on
    // an unchanged listing would miss a deadline extended only on the detail page.
    let html = corpo;
    if (html === null) {
      const guardado = await armazem.conteudoSnapshot(url);
      html =
        guardado === null ? null : new TextDecoder("utf-8").decode(guardado);
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
    const hash = ehPdf
      ? resposta.bytes
        ? hashBytes(resposta.bytes)
        : null
      : hashConteudo(resposta.corpo ?? "");

    if (hash === null || anterior?.hashConteudo === hash) continue;

    const texto = ehPdf
      ? // A PDF's text layer is only needed so evidence quotes can be verified;
        // the model still receives the original bytes.
        extrairTextoPdfAproximado(resposta.bytes)
      : textoVisivel(resposta.corpo ?? "");

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

    // --- 7. Model extraction, only on genuinely changed documents ------------
    chamadasModelo++;
    const resultado = await extractor.extrair({
      urlFonte: candidato.urlDetalhe,
      entidade: fonte.entidade,
      dataRecolha: agora.toISOString().slice(0, 10),
      texto,
      pdf: ehPdf ? (resposta.bytes ?? undefined) : undefined,
    });

    tokensCacheLidos += resultado.tokensCacheLidos;

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

    const decisao = decidir(
      resultado.extraccao,
      verificacao,
      resultado.stopReason,
    );
    if (decisao.needsReview) extraccoesRevisao++;
    else extraccoesOk++;

    const novo = extraccaoParaApoio(resultado.extraccao, decisao, {
      sourceId: fonte.id,
      urlOficial: candidato.urlDetalhe,
      anoPredefinido: agora.getUTCFullYear(),
    });

    // --- 9. Identity resolution ---------------------------------------------
    const resolucao = await resolverEPersistir(armazem, fonte, novo, {
      referenciaLegal: novo.referenciaLegal ?? candidato.referenciaLegalBruta,
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
      candidatos: candidatos.length,
      candidatosIgnorados: ignorados,
      candidatosComData: candidatos.filter((c) => c.dataBruta !== null).length,
      extraccoesOk,
      extraccoesRevisao,
      extraccoesFalhadas,
      errosExtraccao: [...errosExtraccao],
      provasFalhadas,
      tokensCacheLidos,
      chamadasModelo,
      erro,
    },
    apoiosNovos,
    apoiosActualizados,
    eventos,
    conflitos,
    saltouPorNaoModificado: saltou,
  };
}

/**
 * Crude text layer read straight out of the PDF's content streams.
 *
 * Only ever used to verify evidence quotes — the model receives the original PDF
 * bytes, never this. Deliberately not a full parser: a proper extraction of these
 * multi-column measure/cap tables is exactly what mangles them, and the model reads
 * the real document anyway. When this yields too little to verify against, the
 * extraction simply lands in the review queue, which is the correct outcome.
 */
function extrairTextoPdfAproximado(bytes: Uint8Array | null): string {
  if (!bytes) return "";
  const bruto = new TextDecoder("latin1").decode(bytes);
  const pedacos: string[] = [];
  for (const m of bruto.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    const s = m[0]
      .slice(1, -1)
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\n/g, " ");
    if (s.trim().length > 0) pedacos.push(s);
  }
  return pedacos.join(" ").replace(/\s+/g, " ").trim();
}
