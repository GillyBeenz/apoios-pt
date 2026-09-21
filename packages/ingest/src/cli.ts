#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Extractor, ExtractorLote } from "@apoios/extraction";
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
  --tecto-custo-usd <n>
                    Orçamento em dólares para esta corrida inteira, repartido
                    pelas fontes por ordem de execução. Sem isto não há tecto,
                    que é o certo para a corrida nocturna: um portão que pára a
                    meio deixa o catálogo num estado que ninguém escolheu.
  --lote            Extrai pela API de lotes: metade do preço, e a resposta
                    pode demorar até 24h. Não serve a corrida nocturna, que tem
                    de acabar esta noite; serve a primeira passagem sobre o
                    arquivo de uma fonte, que ninguém está à espera.
  --custo-esperado-usd <n>
                    Quanto se espera que custe uma chamada. Só é lido com
                    --lote, onde o tecto tem de cortar por contagem porque não
                    há onde parar depois de submeter. Por omissão 0.06, que é a
                    média medida ($0,1162) a metade do preço. Com --lote e
                    --tecto-custo-usd, sem isto não se submete nada.
  --list            Lista as fontes conhecidas
  --redecidir       Volta a aplicar o portão de publicação às extracções já
                    guardadas. Não chama o modelo nem vai à rede. Use com
                    --dry-run primeiro.

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
      "tecto-custo-usd": { type: "string" },
      lote: { type: "boolean", default: false },
      "custo-esperado-usd": { type: "string" },
      list: { type: "boolean", default: false },
      redecidir: { type: "boolean", default: false },
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

  if (values.redecidir) {
    const simulacao = values["dry-run"] === true;
    const url = process.env.DATABASE_URL;
    if (url === undefined || url.length === 0) {
      console.error("Falta DATABASE_URL. Ver --help.");
      return 2;
    }

    const pool = ArmazemPostgres.poolDe(url);
    try {
      const r = await ArmazemPostgres.redecidir(pool, simulacao);
      console.log(
        `${simulacao ? "[simulação] " : ""}extracções lidas=${r.lidos}  ` +
          `alterados=${r.alterados}  a publicar=${r.publicadosAgora}  ` +
          `a despublicar=${r.despublicadosAgora}`,
      );
      for (const i of r.ilegiveis) {
        // Left exactly as it was, and said out loud. A `bruto` the current schema
        // cannot read is a row whose decision we have no right to rewrite.
        console.warn(`[ilegível, decisão anterior mantida] ${i}`);
      }
      if (r.despublicadosAgora > 0 && !simulacao) {
        console.warn(
          `aviso: ${r.despublicadosAgora} apoio(s) deixaram de estar publicados.`,
        );
      }
    } finally {
      await pool.end();
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

  // O tecto é da corrida, não de cada fonte. O ciclo abaixo passa a cada fonte o
  // que sobra, e subtrai o que ela gastou: cinco fontes com o mesmo tecto seriam
  // cinco orçamentos, que é cinco vezes o que se pediu.
  const tectoDaCorrida = values["tecto-custo-usd"];
  let restanteUsd: number | undefined;
  if (tectoDaCorrida !== undefined) {
    restanteUsd = Number(tectoDaCorrida);
    if (!Number.isFinite(restanteUsd) || restanteUsd < 0) {
      console.error(
        `--tecto-custo-usd inválido: ${JSON.stringify(tectoDaCorrida)}`,
      );
      return 2;
    }
  }

  // Média medida sobre as 99 chamadas com custo em `fund_extractions` ($0,1162),
  // a metade do preço. É uma estimativa e o nome do parâmetro di-lo; o que a
  // corrida gastou de facto sai no resumo, e é contra esse número que se corrige.
  const CUSTO_ESPERADO_LOTE_USD = 0.06;

  const emLote = values.lote === true;
  let custoEsperadoUsd: number | undefined = emLote
    ? CUSTO_ESPERADO_LOTE_USD
    : undefined;
  if (values["custo-esperado-usd"] !== undefined) {
    custoEsperadoUsd = Number(values["custo-esperado-usd"]);
    if (!Number.isFinite(custoEsperadoUsd) || custoEsperadoUsd <= 0) {
      console.error(
        `--custo-esperado-usd inválido: ${JSON.stringify(values["custo-esperado-usd"])}`,
      );
      return 2;
    }
  }

  const buscador = values.fixtures
    ? new BuscadorReplay(values.fixtures)
    : new BuscadorHttp();
  const extractor = emLote ? new ExtractorLote() : new Extractor();
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
        tectoCustoUsd: restanteUsd,
        custoEsperadoPorChamadaUsd: custoEsperadoUsd,
      });

      const m = r.metricas;
      if (restanteUsd !== undefined) {
        restanteUsd = Math.max(0, restanteUsd - m.custoUsd);
      }
      console.log(
        `candidatos=${m.candidatos} (com data: ${m.candidatosComData})  ` +
          `extracções ok=${m.extraccoesOk} por-rever=${m.extraccoesRevisao} ` +
          `falhadas=${m.extraccoesFalhadas}  ` +
          `documentos-mudados=${m.documentosMudados}  ` +
          `chamadas-modelo=${m.chamadasModelo}  custo=$${m.custoUsd.toFixed(4)}  ` +
          `cache-lida=${m.tokensCacheLidos}  ${m.duracaoMs}ms`,
      );

      if (m.extraccoesAdiadasPorTecto > 0) {
        console.log(
          `  tecto de custo atingido: ${m.extraccoesAdiadasPorTecto} documentos ` +
            `ficaram por extrair. A corrida seguinte volta a tentá-los.`,
        );
      }

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
        // Um conflito de identidade é um apoio que não entrou, e até agora só
        // existia na consola: era impresso e não ia para lado nenhum. O `resumo`
        // é o que fica em `ingest_runs`, por isso quem olhasse para a base de
        // dados via uma corrida `ok` e nunca sabia que faltava um apoio — e o
        // log do Actions, onde a linha estava mesmo, expira.
        //
        // Encontrado a ligar a fonte dos avisos do PT2030: a corrida leu cinco
        // avisos e gravou quatro, e o quinto não deixou rasto em `funds`, em
        // `fund_identities` nem em `alertas_operador`. Um apoio perdido em
        // silêncio é o mesmo defeito do plano anual, noutro sítio.
        conflitos: r.conflitos,
        erro: m.erro,
      });

      if (runId !== null) {
        await armazenamento.de(fonte.id).guardarSaudeFonte({
          runId,
          httpStatus: m.httpStatus ?? null,
          bytes: m.bytes,
          duracaoMs: m.duracaoMs,
          candidatos: m.candidatos,
          candidatosIgnorados: m.candidatosIgnorados,
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
