import {
  construirChaves,
  diferenciar,
  resolverIdentidade,
  type Apoio,
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
import { hashBytes, hashConteudo, normalizarConteudo } from "../http/normalizar.ts";
import type { Fonte } from "../sources/tipos.ts";
import type { Armazem } from "./armazem.ts";
import type { MetricasFonte } from "./saude.ts";

export interface OpcoesExecucao {
  readonly fonte: Fonte;
  readonly buscador: Buscador;
  readonly armazem: Armazem;
  readonly extractor: ExtractorLike;
  readonly agora: Date;
  /** Cap on detail documents extracted per run; protects against a runaway listing. */
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
  return normalizarConteudo(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
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
export async function executarFonte(op: OpcoesExecucao): Promise<ResultadoExecucao> {
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

    // Hash the *normalised* body: __VIEWSTATE alone would otherwise make every
    // fetch of an unchanged page look like a change.
    const corpo = resposta.naoModificado ? null : resposta.corpo;
    const hash = corpo === null ? null : hashConteudo(corpo);
    const mudou = corpo !== null && anterior?.hashConteudo !== hash;

    if (corpo !== null) bytesTotais += resposta.bytes?.byteLength ?? corpo.length;

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
      html = guardado === null ? null : new TextDecoder("utf-8").decode(guardado);
    }
    if (html !== null) {
      candidatos.push(...fonte.extrair(html, { urlBase: fonte.urlBase, agora }));
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
  let provasFalhadas = 0;
  let tokensCacheLidos = 0;
  let chamadasModelo = 0;

  const limite = op.maxDetalhes ?? 25;

  for (const candidato of candidatos.slice(0, limite)) {
    const anterior = await armazem.snapshotAnterior(candidato.urlDetalhe);
    const resposta = await buscador.buscar({
      url: candidato.urlDetalhe,
      etag: anterior?.etag ?? null,
      lastModified: anterior?.lastModified ?? null,
    });

    if (resposta.erro !== null || resposta.naoModificado) continue;

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
      extraccoesRevisao++;
      continue;
    }

    // --- 8. Verification, gating, normalisation ------------------------------
    const verificacao = verificarProvas(resultado.extraccao, texto);
    if (verificacao.provaFalhou.length > 0) provasFalhadas++;

    const decisao = decidir(resultado.extraccao, verificacao, resultado.stopReason);
    if (decisao.needsReview) extraccoesRevisao++;
    else extraccoesOk++;

    const novo = extraccaoParaApoio(resultado.extraccao, decisao, {
      sourceId: fonte.id,
      urlOficial: candidato.urlDetalhe,
      anoPredefinido: agora.getUTCFullYear(),
    });

    // --- 9. Identity resolution ---------------------------------------------
    const chaves = construirChaves({
      sourceId: fonte.id,
      referenciaLegal: novo.referenciaLegal ?? candidato.referenciaLegalBruta,
      url: candidato.urlDetalhe,
      titulo: novo.titulo,
      anoAbertura: novo.abreEm.iso ? new Date(novo.abreEm.iso).getUTCFullYear() : null,
    });

    const existentes = await armazem.procurarIdentidades(chaves.map((c) => c.valor));
    const resolucao = resolverIdentidade(chaves, existentes);

    // --- 10. Diff into events ------------------------------------------------
    if (resolucao.tipo === "novo") {
      const apoio = await armazem.criarApoio(novo, chaves);
      apoiosNovos.push(apoio);
      eventos.push(...diferenciar(null, apoio, agora.toISOString()));
      continue;
    }

    if (resolucao.tipo === "conflito") {
      // Never merge. A wrong merge inherits the other fund's filled dedup ledger
      // and silently stops that fund's subscribers from being alerted at all.
      conflitos.push(
        `${novo.titulo}: chaves apontam para ${resolucao.fundIdsEmConflito.join(", ")}`,
      );
      const bloqueado = {
        ...novo,
        needsReview: true,
        alertavel: false,
        motivoRevisao: [...novo.motivoRevisao, "conflito_identidade"],
      };
      apoiosActualizados.push(await armazem.actualizarApoio(resolucao.fundId, bloqueado));
      continue;
    }

    const anteriorApoio = await armazem.obterApoio(resolucao.fundId);
    await armazem.registarIdentidades(resolucao.fundId, resolucao.chavesEmFalta);
    const actualizado = await armazem.actualizarApoio(resolucao.fundId, novo);
    apoiosActualizados.push(actualizado);
    eventos.push(...diferenciar(anteriorApoio, actualizado, agora.toISOString()));
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
      candidatosComData: candidatos.filter((c) => c.dataBruta !== null).length,
      extraccoesOk,
      extraccoesRevisao,
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
