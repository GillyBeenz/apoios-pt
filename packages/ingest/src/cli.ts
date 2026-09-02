#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Extractor } from "@apoios/extraction";
import { BuscadorHttp } from "./http/buscador.ts";
import { BuscadorReplay } from "./http/replay.ts";
import { ArmazemMemoria } from "./pipeline/armazem.ts";
import { executarFonte } from "./pipeline/executar.ts";
import { avaliarSaude } from "./pipeline/saude.ts";
import { FONTES, obterFonte } from "./sources/registo.ts";

const AJUDA = `
apoios ingerir — executa o pipeline de recolha

  --source <id>     Fonte a executar (por omissão: todas)
  --fixtures <dir>  Usa fixtures em vez da rede (obrigatório neste ambiente,
                    onde os domínios do Estado português estão bloqueados)
  --dry-run         Não escreve nada nem chama o modelo
  --list            Lista as fontes conhecidas

Fontes: ${FONTES.map((f) => f.id).join(", ")}
`.trim();

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
    for (const f of FONTES) console.log(`${f.id}\t${f.nome}\t${f.urlsEntrada.length} URL(s)`);
    return 0;
  }

  const fontes = values.source
    ? [obterFonte(values.source)].filter((f) => f !== undefined)
    : [...FONTES];

  if (fontes.length === 0) {
    console.error(`Fonte desconhecida: ${values.source}`);
    return 2;
  }

  const simulacao = values["dry-run"] === true;
  const buscador = values.fixtures ? new BuscadorReplay(values.fixtures) : new BuscadorHttp();
  const armazem = new ArmazemMemoria();
  const extractor = new Extractor();
  const agora = new Date();

  let houveCritico = false;

  for (const fonte of fontes) {
    console.log(`\n=== ${fonte.nome} ===`);

    const r = await executarFonte({
      fonte,
      buscador,
      armazem,
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
