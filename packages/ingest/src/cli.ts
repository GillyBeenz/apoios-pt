#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Extractor } from "@apoios/extraction";
import { BuscadorHttp } from "./http/buscador.ts";
import { BuscadorReplay } from "./http/replay.ts";
import { ArmazemMemoria, type Armazem } from "./pipeline/armazem.ts";
import { ArmazemPostgres } from "./pipeline/armazem-postgres.ts";
import { problemaComLigacao } from "./pipeline/ligacao.ts";
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
Em captura (ignoradas sem --source): ${FONTES.filter(
  (f) => f.estado !== "activa",
)
  .map((f) => f.id)
  .join(", ")}
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
interface Armazenamento {
  /** One store per source: `snapshots.source_id` and `funds.source_id` are both
   * `not null`, and the Armazem interface carries no source argument. */
  de(fonteId: string): Armazem;
  /**
   * Open the run record, returning its id — or null when nothing is being written.
   *
   * `ingest_runs` has existed since the first migration and nothing ever wrote to
   * it, which quietly disabled the one alarm that matters most. `vigiar_ingestao()`
   * runs hourly inside Supabase and asks "was there a successful run in the last
   * 36 hours?"; against an empty table the answer is always no, so it fired once
   * on 2026-09-06 and — because it will not raise a second alarm while the first
   * is unresolved — sat there through five successful runs, unable to report a
   * real outage. A watchdog that cannot go quiet cannot bark.
   */
  abrirExecucao(): Promise<string | null>;
  fecharExecucao(
    runId: string | null,
    estado: "ok" | "parcial" | "falhou",
    resumo: unknown,
  ): Promise<void>;
  fechar(): Promise<void>;
}

function escolherArmazem(simulacao: boolean): Armazenamento {
  if (simulacao) {
    const memoria = new ArmazemMemoria();
    return {
      de: () => memoria,
      abrirExecucao: async () => null,
      fecharExecucao: async () => {},
      fechar: async () => {},
    };
  }

  const url = process.env.DATABASE_URL;

  if (url === undefined || url.length === 0) {
    throw new Error(
      "Falta DATABASE_URL.\n" +
        "É a ligação directa ao Postgres, com o papel `apoios_ingest` — que tem " +
        "grants em nove tabelas e nenhum em `profiles`, `subscriptions`, " +
        "`alerts_sent`, `alerts_outbox`, `unsubscribe_tokens` ou em `auth`. " +
        "Nunca a do utilizador `postgres`: essa é dona do esquema e leria dados " +
        "pessoais para um log público.\n" +
        "Copie a string do painel do Supabase (Connect → Session pooler) e troque " +
        "o utilizador e a palavra-passe pelos do papel:\n" +
        "  postgresql://apoios_ingest.<ref>:<palavra-passe>@<host>.pooler.supabase.com:5432/postgres\n" +
        "Para correr sem escrever nada, use --dry-run.",
    );
  }

  const problema = problemaComLigacao(url);
  if (problema !== null) throw new Error(problema);

  const pool = ArmazemPostgres.poolDe(url);
  return {
    de: (fonteId) => new ArmazemPostgres(pool, fonteId),
    abrirExecucao: () =>
      ArmazemPostgres.abrirExecucao(pool, process.env.GITHUB_SHA ?? null),
    fecharExecucao: (runId, estado, resumo) =>
      runId === null
        ? Promise.resolve()
        : ArmazemPostgres.fecharExecucao(pool, runId, estado, resumo),
    fechar: () => pool.end(),
  };
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
      console.log(
        `${f.id}\t${f.estado}\t${f.nome}\t${f.urlsEntrada.length} URL(s)`,
      );
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
  const buscador = values.fixtures
    ? new BuscadorReplay(values.fixtures)
    : new BuscadorHttp();
  const extractor = new Extractor();
  const agora = new Date();

  const armazenamento = escolherArmazem(simulacao);

  let houveCritico = false;
  let houveErroDeFonte = false;
  const resumo: Record<string, unknown>[] = [];
  const runId = await armazenamento.abrirExecucao();

  try {
    for (const fonte of fontes) {
      console.log(`\n=== ${fonte.nome} ===`);

      const r = await executarFonte({
        fonte,
        buscador,
        armazem: armazenamento.de(fonte.id),
        extractor,
        agora,
        simulacao,
      });

      const m = r.metricas;
      console.log(
        `candidatos=${m.candidatos} (com data: ${m.candidatosComData})  ` +
          `extracções ok=${m.extraccoesOk} por-rever=${m.extraccoesRevisao} ` +
          `falhadas=${m.extraccoesFalhadas}  ` +
          `chamadas-modelo=${m.chamadasModelo}  cache-lida=${m.tokensCacheLidos}  ${m.duracaoMs}ms`,
      );

      // Printed even when the failure rate sits below the alarm threshold: one
      // call failing for a reason nobody reads is how thirty end up failing.
      for (const e of m.errosExtraccao)
        console.log(`  falha de extracção: ${e}`);

      if (r.saltouPorNaoModificado)
        console.log("listagem inalterada desde a última execução");
      if (m.erro) console.log(`erro: ${m.erro}`);

      for (const apoio of r.apoiosNovos) {
        console.log(
          `  + NOVO  ${apoio.titulo}\n` +
            `          estado=${apoio.estado} fecha=${apoio.fechaEm.iso ?? "?"} (${apoio.fechaEm.precisao})\n` +
            `          particulares=${apoio.admiteParticulares} alertável=${apoio.alertavel} ` +
            `medidas=${apoio.medidas.join(",") || "—"}`,
        );
        if (apoio.needsReview)
          console.log(`          por rever: ${apoio.motivoRevisao.join(", ")}`);
      }

      for (const apoio of r.apoiosActualizados) {
        console.log(`  ~ ACTUALIZADO  ${apoio.titulo}`);
      }

      for (const evento of r.eventos) {
        console.log(
          `  ! EVENTO  ${evento.tipo}  alertável=${evento.alertavel}`,
        );
      }

      for (const conflito of r.conflitos) {
        console.log(`  ? CONFLITO DE IDENTIDADE  ${conflito}`);
      }

      // Health is evaluated with an empty history here; in production the trailing
      // median comes from `source_health` and catches the partial-break cases too.
      const alarmes = avaliarSaude(
        m,
        {
          candidatosRecentes: [],
          falhasConsecutivas: m.erro ? 1 : 0,
          horasDesdeMudancaConteudo: null,
        },
        fonte.candidatosMin,
        fonte.cadenciaHoras,
      );
      for (const a of alarmes) {
        console.log(
          `  [${a.gravidade.toUpperCase()}] ${a.regra}: ${a.mensagem}`,
        );
        if (a.gravidade === "critico") houveCritico = true;
      }

      if (m.erro) houveErroDeFonte = true;

      resumo.push({
        fonte: fonte.id,
        candidatos: m.candidatos,
        extraccoesOk: m.extraccoesOk,
        extraccoesRevisao: m.extraccoesRevisao,
        extraccoesFalhadas: m.extraccoesFalhadas,
        chamadasModelo: m.chamadasModelo,
        alarmes: alarmes.map((a) => `${a.gravidade}:${a.regra}`),
        erro: m.erro,
      });

      if (runId !== null) {
        await armazenamento.de(fonte.id).guardarSaudeFonte({
          runId,
          httpStatus: m.httpStatus ?? null,
          bytes: m.bytes,
          duracaoMs: m.duracaoMs,
          candidatos: m.candidatos,
          candidatosComData: m.candidatosComData,
          extraccoesOk: m.extraccoesOk,
          extraccoesRevisao: m.extraccoesRevisao,
          provasFalhadas: m.provasFalhadas,
          tokensCacheLidos: m.tokensCacheLidos,
          erro: m.erro,
        });
      }
    }

    // Written before `finally` closes the pool, and only on the path that got
    // here: a crash leaves the row as `a_correr`, which says "began and never
    // finished" rather than "never ran".
    await armazenamento.fecharExecucao(
      runId,
      houveCritico ? "falhou" : houveErroDeFonte ? "parcial" : "ok",
      { fontes: resumo },
    );
  } finally {
    await armazenamento.fechar();
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
