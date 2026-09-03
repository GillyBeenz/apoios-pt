#!/usr/bin/env node
/**
 * Capture real HTML and PDFs from the source sites and write them as fixtures.
 *
 * This exists because the development sandbox's egress proxy blocks every
 * Portuguese government domain — fundoambiental.pt, portugal2030.pt,
 * diariodarepublica.pt and the rest all fail to connect. GitHub Actions runners
 * are not behind that proxy, so this script runs there and commits what it fetched
 * back to the repo, which is the only way the extractors can be built and tested
 * against the markup the sites actually serve.
 *
 * Run via .github/workflows/capturar-fixtures.yml, not locally.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { normalizarConteudo } from "../packages/ingest/src/http/normalizar.ts";
import { classificar } from "../packages/ingest/src/http/classificar.ts";
import {
  certificadoApresentado,
  ehAutoAssinado,
  ehCadeiaIncompleta,
  normalizarParaPem,
  urlsDoEmissor,
} from "../packages/ingest/src/http/cadeia-tls.ts";
import { FONTES, obterFonte } from "../packages/ingest/src/sources/registo.ts";
import { USER_AGENT } from "../packages/ingest/src/http/tipos.ts";

const ATRASO_MS = 2000;
const MAX_DETALHES = 10;
const LIMITE_PDF_BYTES = 2 * 1024 * 1024;
const LIMITE_TOTAL_BYTES = 20 * 1024 * 1024;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Node's fetch reports every network-layer problem as the same three words, "fetch
 * failed", and puts the actual reason in `cause` — often nested. Reporting only the
 * wrapper is what turned prr-candidaturas into a mystery: DNS failure, refused
 * connection, and a rejected certificate are three very different problems with three
 * different fixes, and they all print identically.
 */
function razaoCompleta(erro) {
  const partes = [];
  let actual = erro;
  for (let i = 0; i < 5 && actual != null; i += 1) {
    const codigo = actual.code ? ` (${actual.code})` : "";
    const texto = `${actual.message ?? String(actual)}${codigo}`;
    if (!partes.includes(texto)) partes.push(texto);
    actual = actual.cause;
  }
  return partes.join(" ← ");
}

function nomeSeguro(url, extensao) {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 10);
  const base =
    (new URL(url).pathname.split("/").pop() ?? "pagina")
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .slice(0, 48) || "pagina";
  return `${base}-${hash}${extensao}`;
}

/**
 * Intermediates recovered per host, so one repair serves every later request.
 * `null` records a host we tried and could not repair — worth remembering, because
 * re-chasing on every URL would triple the requests we make to a site that is
 * already misconfigured.
 */
const intermediariosPorHost = new Map();

/**
 * Fetch the intermediate certificate the server should have sent.
 *
 * See packages/ingest/src/http/cadeia-tls.ts for why this exists and why disabling
 * verification instead would be the wrong trade.
 */
async function repararCadeia(host) {
  if (intermediariosPorHost.has(host)) return intermediariosPorHost.get(host);

  const { X509Certificate } = await import("node:crypto");
  const pems = [];

  // Walk UP the chain, not just one step. Supplying a single intermediate turned
  // `UNABLE_TO_VERIFY_LEAF_SIGNATURE` into `UNABLE_TO_GET_ISSUER_CERT`: the
  // intermediate we fetched was itself missing its own issuer. Real chains are
  // routinely two links deep, so keep climbing until a self-signed root, an
  // exhausted AIA, or a sane depth limit.
  let actual = await certificadoApresentado(host);
  for (let profundidade = 0; actual != null && profundidade < 4; profundidade += 1) {
    if (ehAutoAssinado(actual)) break;

    let seguinte = null;
    for (const url of urlsDoEmissor(actual.infoAccess)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) continue;
        const pem = normalizarParaPem(new Uint8Array(await r.arrayBuffer()));
        pems.push(pem);
        seguinte = new X509Certificate(pem);
        break;
      } catch {
        // Try the next advertised issuer for this level.
      }
    }
    if (seguinte === null) break;
    actual = seguinte;
  }

  const resultado = pems.length > 0 ? pems : null;
  intermediariosPorHost.set(host, resultado);
  return resultado;
}

async function buscar(url, caExtra = undefined) {
  if (caExtra !== undefined) {
    // undici's OWN fetch, not the global one. Node embeds its own private copy of
    // undici, and handing it a dispatcher built from the standalone package fails
    // with `invalid onRequestStart method` — two implementations of the same
    // interface that do not recognise each other's handlers.
    const { Agent, fetch: fetchUndici } = await import("undici");
    // Verification stays ON. The recovered intermediate is added to the trust set,
    // so it still has to chain to a real root for this request to succeed.
    const dispatcher = new Agent({ connect: { ca: caExtra } });
    const r = await fetchUndici(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "accept-language": "pt-PT,pt;q=0.9",
      },
      redirect: "follow",
      dispatcher,
      signal: AbortSignal.timeout(60_000),
    });
    const bytes = new Uint8Array(await r.arrayBuffer());
    return {
      url: r.url || url,
      status: r.status,
      contentType: r.headers.get("content-type"),
      etag: r.headers.get("etag"),
      lastModified: r.headers.get("last-modified"),
      bytes,
    };
  }

  const resposta = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      "accept-language": "pt-PT,pt;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return {
    url: resposta.url || url,
    status: resposta.status,
    contentType: resposta.headers.get("content-type"),
    etag: resposta.headers.get("etag"),
    lastModified: resposta.headers.get("last-modified"),
    bytes,
  };
}

/** `buscar`, retried once with a repaired chain when that is the actual problem. */
async function buscarComReparo(url) {
  try {
    return await buscar(url);
  } catch (erro) {
    if (!ehCadeiaIncompleta(erro)) throw erro;
    const host = new URL(url).hostname;
    const pems = await repararCadeia(host);
    if (pems === null) throw erro;
    console.log(
      `  (cadeia TLS de ${host} reparada com ${pems.length} certificado(s) em falta)`,
    );
    return await buscar(url, pems);
  }
}

/** Respect robots.txt. These are public services, not a scraping target. */
async function permitido(urlBase, caminho) {
  try {
    const r = await fetch(new URL("/robots.txt", urlBase), {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return true;
    const texto = await r.text();

    let emGeral = false;
    const proibidos = [];
    for (const linha of texto.split("\n")) {
      const l = linha.trim().toLowerCase();
      if (l.startsWith("user-agent:")) emGeral = l.slice(11).trim() === "*";
      else if (emGeral && l.startsWith("disallow:")) {
        const p = l.slice(9).trim();
        if (p.length > 0) proibidos.push(p);
      }
    }
    return !proibidos.some((p) => caminho.startsWith(p));
  } catch {
    return true;
  }
}

async function capturarFonte(fonte, dirRaiz) {
  const dir = join(dirRaiz, fonte.id, "fixtures");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const entradas = [];
  const resumo = [];
  let bytesTotais = 0;
  let erroFatal = null;

  try {
    for (const url of fonte.urlsEntrada) {
      if (!(await permitido(fonte.urlBase, new URL(url).pathname))) {
        resumo.push(`- ${url} — IGNORADO por robots.txt`);
        continue;
      }

      await dormir(ATRASO_MS);
      const r = await buscarComReparo(url);
      const tipo = classificar(r.url, r.contentType);

      let ficheiro;
      let html = null;
      if (tipo.binario) {
        if (r.bytes.byteLength > LIMITE_PDF_BYTES) {
          resumo.push(`- ${r.url} — ${r.bytes.byteLength} bytes, grande demais para commitar`);
          continue;
        }
        ficheiro = nomeSeguro(r.url, tipo.extensao);
        await writeFile(join(dir, ficheiro), r.bytes);
        bytesTotais += r.bytes.byteLength;
        resumo.push(
          `- ${r.url}\n  status ${r.status}, ${r.bytes.byteLength} bytes ` +
            `(${tipo.extensao}), etag ${r.etag ?? "—"}`,
        );
      } else {
        const bruto = new TextDecoder("utf-8").decode(r.bytes);
        // Strip the viewstate before writing. On these ASP.NET sites it is routinely
        // the largest thing on the page — often 100 KB+ of rotating base64 — and
        // removing it is what makes committing real fixtures viable at all.
        html = tipo.normalizar ? normalizarConteudo(bruto) : bruto;
        ficheiro = nomeSeguro(r.url, tipo.extensao);
        await writeFile(join(dir, ficheiro), html, "utf8");
        bytesTotais += html.length;
        resumo.push(
          `- ${r.url}\n  status ${r.status}, ${html.length} bytes após limpeza ` +
            `(${bruto.length} em bruto), etag ${r.etag ?? "—"}\n` +
            `  \`${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)}…\``,
        );
      }

      entradas.push({
        url: r.url,
        ficheiro,
        status: r.status,
        contentType: r.contentType,
        etag: r.etag,
        lastModified: r.lastModified,
        capturadoEm: new Date().toISOString(),
      });

      if (r.status !== 200 || html === null) continue;

      // Follow the notices this listing links to, so there is a detail document
      // (and ideally a real PDF) to build the extraction against.
      // Report what the extractor ACTUALLY found, then how many were followed. The
      // earlier version counted after the cap, so a page yielding 47 notices was
      // reported as 10 — and that number is precisely what a person reads to sanity-
      // check a health floor.
      const todos = fonte.extrair(html, { urlBase: fonte.urlBase, agora: new Date() });
      const candidatos = todos.slice(0, MAX_DETALHES);

      resumo.push(
        `  → ${todos.length} candidato(s) encontrado(s) pelo extractor actual` +
          (todos.length > candidatos.length ? `, a seguir os primeiros ${candidatos.length}` : ""),
      );

      for (const c of candidatos) {
        if (bytesTotais > LIMITE_TOTAL_BYTES) {
          resumo.push("  → limite total atingido, restantes ignorados");
          break;
        }
        if (!(await permitido(fonte.urlBase, new URL(c.urlDetalhe).pathname))) continue;

        await dormir(ATRASO_MS);
        try {
          const d = await buscarComReparo(c.urlDetalhe);
          const tipoD = classificar(d.url, d.contentType);
          let ficheiroD;

          if (tipoD.binario) {
            if (d.bytes.byteLength > LIMITE_PDF_BYTES) {
              // Too big to commit; it still reaches the artifact upload, and the
              // manifest records where it came from.
              resumo.push(
                `  - ${d.url} — ${tipoD.extensao} de ${d.bytes.byteLength} bytes, não commitado`,
              );
              continue;
            }
            ficheiroD = nomeSeguro(d.url, tipoD.extensao);
            await writeFile(join(dir, ficheiroD), d.bytes);
            bytesTotais += d.bytes.byteLength;
            resumo.push(`  - ${d.url} — ${tipoD.extensao}, ${d.bytes.byteLength} bytes`);
          } else {
            const brutoD = new TextDecoder("utf-8").decode(d.bytes);
            const limpoDetalhe = tipoD.normalizar ? normalizarConteudo(brutoD) : brutoD;
            ficheiroD = nomeSeguro(d.url, tipoD.extensao);
            await writeFile(join(dir, ficheiroD), limpoDetalhe, "utf8");
            bytesTotais += limpoDetalhe.length;
            resumo.push(`  - ${d.url} — ${tipoD.extensao}, ${limpoDetalhe.length} bytes`);
          }

          entradas.push({
            url: d.url,
            ficheiro: ficheiroD,
            status: d.status,
            contentType: d.contentType,
            etag: d.etag,
            lastModified: d.lastModified,
            capturadoEm: new Date().toISOString(),
          });
        } catch (erro) {
          resumo.push(`  - ${c.urlDetalhe} — FALHOU: ${razaoCompleta(erro)}`);
        }
      }
    }
  } catch (erro) {
    // Record and carry on. A source that threw used to leave no directory at
    // all, so it vanished from the resulting PR with no explanation — which is
    // exactly what happened to prr-candidaturas and cost a round trip to find.
    erroFatal = erro instanceof Error ? razaoCompleta(erro) : String(erro);
    resumo.push(`- **FALHOU:** ${erroFatal}`);
  }

  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify(
      { sourceId: fonte.id, capturadoEm: new Date().toISOString(), erro: erroFatal, entradas },
      null,
      2,
    ),
    "utf8",
  );

  return { entradas, resumo, bytesTotais, erroFatal };
}

async function main() {
  const pedidas = (process.env.FONTES ?? "").trim();
  // Deliberately FONTES, not FONTES_ACTIVAS: the sources that most need capturing
  // are precisely the ones the pipeline is still skipping.
  const fontes =
    pedidas.length > 0
      ? pedidas.split(",").map((id) => obterFonte(id.trim())).filter(Boolean)
      : [...FONTES];

  const dirRaiz = "packages/ingest/src/sources";
  const linhas = ["# Captura de fixtures", "", `Executado em ${new Date().toISOString()}`, ""];
  let total = 0;

  for (const fonte of fontes) {
    linhas.push(`## ${fonte.nome} (\`${fonte.id}\`, ${fonte.estado})`, "");
    try {
      const r = await capturarFonte(fonte, dirRaiz);
      linhas.push(...r.resumo, "", `**${r.entradas.length} ficheiro(s), ${r.bytesTotais} bytes.**`, "");
      total += r.bytesTotais;
    } catch (erro) {
      linhas.push(`**FALHOU:** ${erro.message}`, "");
    }
  }

  linhas.push(
    "---",
    "",
    "O `__VIEWSTATE` e outros campos voláteis foram removidos antes de escrever.",
    "Se um sítio devolveu uma página de erro em vez do conteúdo esperado, isso é",
    "visível na pré-visualização de texto acima.",
  );

  await writeFile("RESUMO-FIXTURES.md", linhas.join("\n"), "utf8");
  console.log(linhas.join("\n"));

  if (total > LIMITE_TOTAL_BYTES) {
    console.error(`\nTotal ${total} bytes excede o limite de ${LIMITE_TOTAL_BYTES}.`);
    process.exit(1);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
