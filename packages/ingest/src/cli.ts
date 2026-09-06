#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Extractor } from "@apoios/extraction";
import { BuscadorHttp } from "./http/buscador.ts";
import { BuscadorReplay } from "./http/replay.ts";
import { ArmazemMemoria, type Armazem } from "./pipeline/armazem.ts";
import { ArmazemSupabase } from "./pipeline/armazem-supabase.ts";
import { executarFonte } from "./pipeline/executar.ts";
import { avaliarSaude } from "./pipeline/saude.ts";
import { FONTES, FONTES_ACTIVAS, obterFonte } from "./sources/registo.ts";

const AJUDA = `
apoios ingerir — executa o pipeline de recolha

  --source <id>     Fonte a executar (por omissão: todas)
  --fixtures <dir>  Usa fixtures em vez da rede (obrigatório neste ambiente,
                    onde os domínios do Estado português estão bloqueados)
  --dry-run         Não escreve nada nem chama o modelo
  --list            Lista as fontes conhecidas

Fontes activas: ${FONTES_ACTIVAS.map((f) => f.id).join(", ")}
Em captura (ignoradas sem --source): ${FONTES.filter((f) => f.estado !== "activa").map((f) => f.id).join(", ")}
`.trim();

/**
 * Pick the store, and refuse to guess.
 *
 * This used to be an unconditional `new ArmazemMemoria()`, including on the
 * scheduled run. The job fetched every source, paid the model to extract each
 * notice, wrote the results into a Map and exited — green, with a log full of
 * candidates found and extractions succeeded, and an empty database. Nothing
 * failed, so nothing ever said so.
 *
 * A missing credential now stops the run. Falling back to memory would reproduce
 * exactly that failure, and an ingestion job that silently discards its work is
 * worse than one that does not start: the catalogue stays empty either way, but
 * only the second tells anybody.
 */
function escolherArmazem(simulacao: boolean): (fonteId: string) => Armazem {
  if (simulacao) {
    const memoria = new ArmazemMemoria();
    return () => memoria;
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_INGEST_KEY;

  if (url === undefined || chave === undefined) {
    throw new Error(
      "Faltam credenciais: SUPABASE_URL e SUPABASE_INGEST_KEY. " +
        "A chave é um JWT com `role: apoios_ingest` — nunca a service_role, que " +
        "ignora o RLS e leria dados pessoais para um log público. " +
        "Para correr sem escrever nada, use --dry-run.",
    );
  }

  // One store per source: `snapshots.source_id` and `funds.source_id` are both
  // `not null`, and the Armazem interface carries no source argument.
  return (fonteId) => ArmazemSupabase.de(url, chave, fonteId);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      fixtures: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(AJUDA);
    return 0;
  }

  if (values.list) {
    for (const f of FONTES) {
      console.log(`${f.id}\t${f.estado}\t${f.nome}\t${f.urlsEntrada.length} URL(s)`);
    }
    return 0;
  }

  // Naming a source explicitly runs it even when unverified — that is how one is
  // developed against fresh fixtures. Running everything runs only the verified
  // ones, so a stub extractor's empty result can never be mistaken for a live
  // source whose selectors have broken.
  const fontes = values.source
    ? [obterFonte(values.source)].filter((f) => f !== undefined)
    : [...FONTES_ACTIVAS];

  if (fontes.length === 0) {
    console.error(`Fonte desconhecida: ${values.source}`);
    return 2;
  }

  for (const f of fontes) {
    if (f.estado !== "activa") {
      console.warn(
        `aviso: ${f.id} está em captura — o extractor ainda não foi verificado ` +
          `contra o markup real, por isso zero candidatos não significa nada.`,
      );
    }
  }

  const simulacao = values["dry-run"] === true;
  const buscador = values.fixtures ? new BuscadorReplay(values.fixtures) : new BuscadorHttp();
  const extractor = new Extractor();
  const agora = new Date();

  const armazemDe = escolherArmazem(simulacao);

  let houveCritico = false;

  for (const fonte of fontes) {
    console.log(`\n=== ${fonte.nome} ===`);

    const r = await executarFonte({
      fonte,
      buscador,
      armazem: armazemDe(fonte.id),
      extractor,
      agora,
      simulacao,
    });

    const m = r.metricas;
    console.log(
      `candidatos=${m.candidatos} (com data: ${m.candidatosComData})  ` +
        `extracções ok=${m.extraccoesOk} por-rever=${m.extraccoesRevisao}  ` +
        `chamadas-modelo=${m.chamadasModelo}  cache-lida=${m.tokensCacheLidos}  ${m.duracaoMs}ms`,
    );

    if (r.saltouPorNaoModificado) console.log("listagem inalterada desde a última execução");
    if (m.erro) console.log(`erro: ${m.erro}`);

    for (const apoio of r.apoiosNovos) {
      console.log(
        `  + NOVO  ${apoio.titulo}\n` +
          `          estado=${apoio.estado} fecha=${apoio.fechaEm.iso ?? "?"} (${apoio.fechaEm.precisao})\n` +
          `          particulares=${apoio.admiteParticulares} alertável=${apoio.alertavel} ` +
          `medidas=${apoio.medidas.join(",") || "—"}`,
      );
      if (apoio.needsReview) console.log(`          por rever: ${apoio.motivoRevisao.join(", ")}`);
    }

    for (const apoio of r.apoiosActualizados) {
      console.log(`  ~ ACTUALIZADO  ${apoio.titulo}`);
    }

    for (const evento of r.eventos) {
      console.log(`  ! EVENTO  ${evento.tipo}  alertável=${evento.alertavel}`);
    }

    for (const conflito of r.conflitos) {
      console.log(`  ? CONFLITO DE IDENTIDADE  ${conflito}`);
    }

    // Health is evaluated with an empty history here; in production the trailing
    // median comes from `source_health` and catches the partial-break cases too.
    const alarmes = avaliarSaude(
      m,
      { candidatosRecentes: [], falhasConsecutivas: m.erro ? 1 : 0, horasDesdeMudancaConteudo: null },
      fonte.candidatosMin,
      fonte.cadenciaHoras,
    );
    for (const a of alarmes) {
      console.log(`  [${a.gravidade.toUpperCase()}] ${a.regra}: ${a.mensagem}`);
      if (a.gravidade === "critico") houveCritico = true;
    }
  }

  // A non-zero exit fails the Actions job, which is how the operator finds out —
  // GitHub emails the repo owner on workflow failure at no cost.
  return houveCritico ? 1 : 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(erro);
    process.exit(1);
  },
);
