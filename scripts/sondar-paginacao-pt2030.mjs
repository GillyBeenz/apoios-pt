/**
 * Perguntar ao endpoint de avisos do PT2030 se ele sabe paginar.
 *
 * A casca com rede de `packages/ingest/src/sources/pt2030-avisos-listagem/sonda.ts`.
 * Toda a decisão — que corpos enviar, o que cada resposta quer dizer — vive lá e
 * corre sem rede; aqui só se fazem os pedidos e se escreve o que voltou.
 *
 * Corre no GitHub Actions porque o ambiente de desenvolvimento não chega a
 * `portugal2030.pt`: o proxy de saída recusa todos os domínios do Estado com 403
 * ao CONNECT.
 *
 * O resultado é um ficheiro de prova em `fixtures-permanentes/`. Não é um
 * relatório para ler uma vez e deitar fora: é o que impede a próxima pessoa de
 * repetir esta ronda de tentativa e erro contra um servidor que não é nosso.
 */

import { writeFile } from "node:fs/promises";
import {
  baseEstavel,
  classificar,
  codigosDe,
  variantes,
} from "../packages/ingest/src/sources/pt2030-avisos-listagem/sonda.ts";
import {
  corpoDoPedido,
  TIPO_CONTEUDO,
  URL_QUERY,
} from "../packages/ingest/src/sources/pt2030-avisos-listagem/pedido.ts";

const USER_AGENT =
  "apoios.guru/0.1 (+https://github.com/GillyBeenz/apoios-pt) sonda-de-contrato";

/** Entre pedidos. O servidor não é nosso e a sonda faz duas dezenas deles. */
const ATRASO_MS = 1500;

const DESTINO = new URL(
  "../packages/ingest/src/sources/comum/fixtures-permanentes/pt2030-avisos-query-paginacao.json",
  import.meta.url,
);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(corpo) {
  const inicio = Date.now();
  try {
    const r = await fetch(URL_QUERY, {
      method: "POST",
      body: corpo,
      headers: {
        "user-agent": USER_AGENT,
        "content-type": TIPO_CONTEUDO,
        accept: "application/json, */*;q=0.8",
        "accept-language": "pt-PT,pt;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    const texto = await r.text();
    return {
      status: r.status,
      bytes: Buffer.byteLength(texto),
      codigos: r.status === 200 ? codigosDe(texto) : null,
      ms: Date.now() - inicio,
      erro: null,
    };
  } catch (erro) {
    // Uma falha de rede não é uma observação sobre o parâmetro, e fica marcada
    // como tal em vez de virar um `ignorado` silencioso.
    return { status: 0, bytes: 0, codigos: null, ms: Date.now() - inicio, erro: String(erro) };
  }
}

async function principal() {
  const base = corpoDoPedido();

  console.log(`Base: POST ${URL_QUERY}`);
  const primeira = await pedir(base);
  console.log(`  status ${primeira.status}, ${primeira.codigos?.length ?? "—"} avisos`);
  if (primeira.codigos !== null) console.log(`  ${primeira.codigos.join(", ")}`);

  const lista = variantes();
  const resultados = [];

  for (const v of lista) {
    await dormir(ATRASO_MS);
    const r = await pedir(v.corpo);
    const veredicto = classificar(primeira, r);
    resultados.push({
      nome: v.nome,
      familia: v.familia,
      status: r.status,
      avisos: r.codigos?.length ?? null,
      codigos: r.codigos,
      veredicto,
      erro: r.erro,
    });
    console.log(
      `${veredicto.padEnd(12)} ${v.nome.padEnd(24)} status ${r.status}, ` +
        `${r.codigos?.length ?? "—"} avisos`,
    );
  }

  await dormir(ATRASO_MS);
  const ultima = await pedir(base);
  const estavel = baseEstavel(primeira, ultima);

  const controlo = resultados.find((r) => r.familia === "controlo");
  const controloPassou = controlo?.veredicto === "reconhecido";
  const reconhecidos = resultados.filter(
    (r) => r.familia !== "controlo" && r.veredicto === "reconhecido",
  );

  const prova = {
    observado_em: new Date().toISOString().slice(0, 10),
    como:
      "scripts/sondar-paginacao-pt2030.mjs, no GitHub Actions. Cada variante é o corpo " +
      "que a fonte envia mesmo, com um parâmetro acrescentado. Um parâmetro que o " +
      "servidor não percebe é ignorado e devolve a mesma resposta; qualquer diferença " +
      "quer dizer que alguém do outro lado leu aquele nome.",
    pedido: { url: URL_QUERY, metodo: "POST", tipo_conteudo: TIPO_CONTEUDO, corpo_base: base },
    base: {
      primeira: { status: primeira.status, avisos: primeira.codigos?.length ?? null, codigos: primeira.codigos },
      ultima: { status: ultima.status, avisos: ultima.codigos?.length ?? null, codigos: ultima.codigos },
      estavel,
    },
    controlo_positivo: {
      nome: controlo?.nome ?? null,
      passou: controloPassou,
      porque:
        "`order_by_direction` é o único parâmetro que se sabe que o endpoint lê. Se " +
        "invertê-lo não mudar a resposta, a sonda não consegue detectar um parâmetro " +
        "que funcione, e um resultado todo `ignorado` não prova ausência de paginação.",
    },
    variantes: resultados,
    conclusao: !estavel
      ? "NÃO FIÁVEL: a resposta base mudou a meio da sonda."
      : !controloPassou
        ? "NÃO FIÁVEL: o controlo positivo não mudou a resposta."
        : reconhecidos.length === 0
          ? "Nenhum dos nomes experimentados foi reconhecido. A lista está no ficheiro; " +
            "um nome que não foi experimentado continua por experimentar."
          : `Reconhecidos: ${reconhecidos.map((r) => r.nome).join(", ")}.`,
  };

  await writeFile(DESTINO, JSON.stringify(prova, null, 2) + "\n", "utf8");

  console.log(`\nBase estável: ${estavel}`);
  console.log(`Controlo positivo: ${controloPassou ? "passou" : "FALHOU"}`);
  console.log(prova.conclusao);
  console.log(`\nEscrito em ${DESTINO.pathname}`);

  // A sonda só falha quando não produziu prova nenhuma. «Nenhum nome
  // reconhecido» é um resultado, não um erro — e fazer o workflow ficar vermelho
  // por isso ensinava a ignorá-lo.
  if (!estavel || !controloPassou) process.exitCode = 1;
}

await principal();
