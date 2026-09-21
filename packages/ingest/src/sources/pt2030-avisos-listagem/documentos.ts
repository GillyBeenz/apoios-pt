import type { Candidato } from "@apoios/core";
import { normalizarEspacos } from "@apoios/core";

/**
 * The PDFs behind an aviso, and which one of them to read.
 *
 * The endpoint answers with everything a card needs except the two fields the
 * alert path is built on: `medidas` and `beneficiarios`. There is no field for
 * either, on any notice — they live in the PDF. This module turns that PDF into a
 * candidate the normal detail phase can fetch, hash and extract.
 *
 * Pure and offline, like every other reader here. The download address is derived
 * from two fields the endpoint already gives, and the route is written down in
 * `comum/fixtures-permanentes/LEIA-ME.md`.
 */

/** `GET /wp-json/avisos/download?path=<path>&container=<container>`. */
export const ROTA_DESCARGA = "https://portugal2030.pt/wp-json/avisos/download";

export function urlDeDescarga(path: string, container: string): string {
  const q = new URLSearchParams({ path, container });
  return `${ROTA_DESCARGA}?${q.toString()}`;
}

interface DocumentoDeAviso {
  readonly nome: string;
  readonly url: string;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = normalizarEspacos(valor);
  return limpo.length > 0 ? limpo : null;
}

/**
 * The documents of one notice that are the notice itself.
 *
 * Filtered on `tipoDocumentoDesignacao === "Aviso"` **and** on the filename ending
 * in `.pdf`. The type label alone is not enough: of 673 documents carrying it, two
 * are `.docx` and one is the `DOC4_Modelo_Mapa_orçamental.xlsx` of the
 * `CENTRO2030-2026-16` — a budget template filed as though it were the notice.
 * 99,6% right is exactly the rate at which a label gets trusted and then costs
 * something.
 */
export function documentosDeAviso(registo: unknown): DocumentoDeAviso[] {
  if (typeof registo !== "object" || registo === null) return [];
  const lista = (registo as Record<string, unknown>)["documentos"];
  if (!Array.isArray(lista)) return [];

  const saida: DocumentoDeAviso[] = [];
  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const d = item as Record<string, unknown>;
    if (texto(d["tipoDocumentoDesignacao"]) !== "Aviso") continue;

    const nome = texto(d["documentoDesignacao"]);
    const path = texto(d["path"]);
    const container = texto(d["container"]);
    if (nome === null || path === null || container === null) continue;
    if (!/\.pdf$/i.test(nome)) continue;

    saida.push({ nome, url: urlDeDescarga(path, container) });
  }
  return saida;
}

export interface OpcoesCandidatos {
  /**
   * Also emit notices that carry several `Aviso` PDFs.
   *
   * Off by default, and that is the whole point of the flag. With several
   * documents there is a choice to make — which one is in force — and making it
   * wrong means announcing revoked conditions to somebody about to apply. The
   * answer is the PDF's own `ModDate`, measured over all 127 multi-document
   * notices: 568 of 568 documents carry one, with zero ties. But reading it means
   * downloading every version of every notice, and that is a second pass, not a
   * flag on this one.
   */
  readonly incluirAmbiguos?: boolean;
}

/**
 * One candidate per notice whose current version is not in question.
 *
 * Measured on 21/09/2026: of 230 open notices, 127 carry more than one `Aviso`
 * PDF — up to nine. The rest carry exactly one, and for those there is nothing to
 * choose. `#91` measured why a filename cannot make the choice: 303 distinct
 * filename forms over four conventions, and the API's own `documentoData` is
 * identical across every document of a notice because it is the notice's date,
 * not the file's.
 *
 * The notice code goes in as `referenciaLegalBruta`, so the extraction resolves
 * onto the fund the dataset path already created instead of duplicating it —
 * `construirChaves` gives a legal reference strength 100, and both come from this
 * same source id.
 */
export function candidatosDeAvisos(
  json: string,
  opcoes: OpcoesCandidatos = {},
): Candidato[] {
  let raiz: unknown;
  try {
    raiz = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof raiz !== "object" || raiz === null) return [];
  const lista = (raiz as Record<string, unknown>)["avisos"];
  if (!Array.isArray(lista)) return [];

  const candidatos: Candidato[] = [];

  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const registo = item as Record<string, unknown>;
    const aviso = registo["aviso"];
    if (typeof aviso !== "object" || aviso === null) continue;
    const a = aviso as Record<string, unknown>;

    const codigo = texto(a["codigoAviso"]);
    const titulo = texto(a["designacaoPT"]);
    if (codigo === null || titulo === null) continue;

    const docs = documentosDeAviso(registo);
    if (docs.length === 0) continue;
    if (docs.length > 1 && opcoes.incluirAmbiguos !== true) continue;

    // Com vários, e só com a bandeira ligada, entra o último da lista. Não é uma
    // escolha defensável — é só determinista — e por isso a bandeira está
    // desligada. A escolha a sério é pelo `ModDate`, e precisa de os descarregar.
    const escolhido = docs[docs.length - 1]!;

    candidatos.push({
      titulo,
      urlDetalhe: escolhido.url,
      urlCanonica: escolhido.url,
      referenciaLegalBruta: codigo,
      // O prazo vem do `calendario` do próprio endpoint, já lido pelo
      // `lerAvisos`. Repeti-lo aqui era dar duas respostas à mesma pergunta.
      dataBruta: null,
      tipoDocumento: "pdf",
    });
  }

  return candidatos;
}
