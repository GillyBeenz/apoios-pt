import { unzipSync, strFromU8 } from "fflate";
import type { PrecisaoData, TipoBeneficiario, Triestado } from "@apoios/core";
import { normalizarEspacos } from "@apoios/core";

/**
 * Reader for the Plano Anual de Avisos spreadsheet.
 *
 * Read directly rather than sent to the model: the sheet is already structured, so
 * parsing it is free, deterministic and testable offline, where 211 rows through
 * Claude would cost real money and be less accurate than the columns already there.
 *
 * What the real file actually contains, measured rather than assumed — 211 planned
 * notices for May 2026 to April 2027, and `Tipo Ent. Beneficiária` taking exactly
 * three values: `Pública` (113), `Privada` (49), `Pública | Privada` (49). **Not one
 * row admits pessoas singulares.** Even the twenty housing rows are `Pública`, i.e.
 * municipal social housing. So this source can populate the catalogue with what is
 * coming, and can never legitimately produce a homeowner alert.
 */

/** One planned notice, as the sheet describes it. Nothing here is a commitment. */
export interface AvisoPrevisto {
  readonly id: string;
  readonly titulo: string;
  readonly programa: string | null;
  readonly objetivoEspecifico: string | null;
  readonly fundo: string | null;
  readonly natureza: string | null;
  readonly dotacaoEur: number | null;
  readonly abreEm: string | null;
  readonly abreEmPrecisao: PrecisaoData;
  readonly fechaEm: string | null;
  readonly fechaEmPrecisao: PrecisaoData;
  readonly regioes: readonly string[];
  readonly beneficiarios: readonly TipoBeneficiario[];
  readonly admiteParticulares: Triestado;
}

/**
 * Excel dates carry a deliberate bug: the format reproduces Lotus 1-2-3's belief that
 * 1900 was a leap year, so serial 60 is a 29 February that never existed.
 *
 * The practical effect is that the epoch is NOT constant. Serial 1 is 1900-01-01,
 * which puts day zero at 1899-12-31; but from serial 61 onward every real date has
 * been pushed one day later by the phantom, so day zero becomes 1899-12-30.
 *
 * Using the single 1899-12-30 epoch — the usual shortcut — is right for every date
 * this plan contains and wrong for the first two months of 1900. Rather than leave
 * that as a caveat nobody will remember, both branches are handled.
 */
const EPOCA_POS_BUG = Date.UTC(1899, 11, 30);
const EPOCA_PRE_BUG = Date.UTC(1899, 11, 31);

export function dataDeSerieExcel(serie: number): string {
  const n = Math.round(serie);
  const epoca = n >= 61 ? EPOCA_POS_BUG : EPOCA_PRE_BUG;
  return new Date(epoca + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A *quadrimestre* is four months, not three.
 *
 * The column is labelled `Quadrimestre` and its values read `Q1`, `Q2`, `Q3`, which
 * look exactly like calendar quarters. Reading Q2 as April–June rather than May–August
 * would put a notice two months early — the kind of quiet arithmetic error that turns
 * into a user planning around a window that has not opened.
 */
export function mesesDoQuadrimestre(q: string): { primeiro: number; ultimo: number } | null {
  const n = Number(q.trim().replace(/^q/i, ""));
  if (!Number.isInteger(n) || n < 1 || n > 3) return null;
  return { primeiro: (n - 1) * 4 + 1, ultimo: n * 4 };
}

/**
 * Fails closed, by construction.
 *
 * `Pública` is unambiguous: public bodies, so `nao`. `Privada` is NOT — in Portuguese
 * funding language an "entidade privada" is an organisation, and whether a given
 * programme's private category reaches a sole trader is settled by the notice, not by
 * this sheet. That is `desconhecido`, which blocks alerts exactly as `nao` does while
 * being honest that the sheet did not say.
 */
export function elegibilidadeDe(tipoEnt: string): {
  beneficiarios: TipoBeneficiario[];
  admiteParticulares: Triestado;
} {
  const t = tipoEnt.toLowerCase();
  const publica = t.includes("pública") || t.includes("publica");
  const privada = t.includes("privada");

  const beneficiarios: TipoBeneficiario[] = [];
  if (publica) beneficiarios.push("entidade_publica", "municipio");
  if (privada) beneficiarios.push("empresa");

  return {
    beneficiarios,
    admiteParticulares: privada ? "desconhecido" : publica ? "nao" : "desconhecido",
  };
}

function celulas(sheetXml: string, partilhadas: string[]): Map<string, string>[] {
  const linhas: Map<string, string>[] = [];
  for (const linha of sheetXml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const corpo = linha[1] ?? "";
    const m = new Map<string, string>();
    for (const encontrado of corpo.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/gs)) {
      const ref = encontrado[1];
      const atributos = encontrado[2] ?? "";
      const valor = /<v>(.*?)<\/v>/s.exec(encontrado[3] ?? "")?.[1];
      if (ref === undefined || valor === undefined) continue;
      m.set(ref, atributos.includes('t="s"') ? (partilhadas[Number(valor)] ?? "") : valor);
    }
    if (m.size > 0) linhas.push(m);
  }
  return linhas;
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function lerPlanoAnual(bytes: Uint8Array): AvisoPrevisto[] {
  const zip = unzipSync(bytes);
  const sheet = zip["xl/worksheets/sheet1.xml"];
  if (sheet === undefined) throw new Error("A folha não tem xl/worksheets/sheet1.xml");

  const partilhadas: string[] = [];
  const sstBruto = zip["xl/sharedStrings.xml"];
  if (sstBruto !== undefined) {
    for (const encontrado of strFromU8(sstBruto).matchAll(/<si>(.*?)<\/si>/gs)) {
      const si = encontrado[1] ?? "";
      partilhadas.push(
        desescapar([...si.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((m) => m[1] ?? "").join("")),
      );
    }
  }

  const linhas = celulas(strFromU8(sheet), partilhadas);

  // Locate the header by its contents rather than by a fixed row number: the file
  // opens with a title row, and a future revision may add or drop banner rows.
  const iCabecalho = linhas.findIndex((l) =>
    [...l.values()].some((v) => normalizarEspacos(v) === "Designacao do Aviso"),
  );
  if (iCabecalho === -1) throw new Error("Não encontrei a linha de cabeçalho");

  const coluna = new Map<string, string>();
  for (const [ref, valor] of linhas[iCabecalho]!) {
    coluna.set(normalizarEspacos(valor).toLowerCase(), ref);
  }
  const em = (l: Map<string, string>, nome: string): string => {
    const ref = coluna.get(nome.toLowerCase());
    return ref === undefined ? "" : normalizarEspacos(l.get(ref) ?? "");
  };

  const avisos: AvisoPrevisto[] = [];
  for (const l of linhas.slice(iCabecalho + 1)) {
    const titulo = em(l, "Designacao do Aviso");
    const id = em(l, "ID");
    if (titulo === "" || id === "") continue;

    const inicio = em(l, "Data Inicio Prevista");
    const fim = em(l, "Data Fim Prevista");
    const quadrimestre = em(l, "Quadrimestre");
    const dotacao = Number(em(l, "Dotação Fundo"));

    // An exact serial gives a day; otherwise the quadrimestre is the best available,
    // and it is a month at best. The precision travels with the date so the UI can
    // never render "durante Maio de 2026" as an exact deadline.
    let abreEm: string | null = null;
    let abreEmPrecisao: PrecisaoData = "desconhecida";
    if (inicio !== "" && Number.isFinite(Number(inicio))) {
      abreEm = dataDeSerieExcel(Number(inicio));
      abreEmPrecisao = "dia";
    } else {
      const meses = mesesDoQuadrimestre(quadrimestre);
      if (meses !== null) {
        const ano = new Date().getUTCFullYear();
        abreEm = `${ano}-${String(meses.primeiro).padStart(2, "0")}-01`;
        abreEmPrecisao = "mes";
      }
    }

    const { beneficiarios, admiteParticulares } = elegibilidadeDe(
      em(l, "Tipo Ent. Beneficiária"),
    );

    avisos.push({
      id,
      titulo,
      programa: em(l, "Programa") || null,
      objetivoEspecifico: em(l, "Objetivo Especifico") || null,
      fundo: em(l, "Fundo") || null,
      natureza: em(l, "Natureza Aviso") || null,
      dotacaoEur: Number.isFinite(dotacao) && dotacao > 0 ? Math.round(dotacao) : null,
      abreEm,
      abreEmPrecisao,
      fechaEm:
        fim !== "" && Number.isFinite(Number(fim)) ? dataDeSerieExcel(Number(fim)) : null,
      fechaEmPrecisao: fim !== "" && Number.isFinite(Number(fim)) ? "dia" : "desconhecida",
      regioes: em(l, "NUTS II")
        .split("|")
        .map((r) => r.trim())
        .filter((r) => r.length > 0),
      beneficiarios,
      admiteParticulares,
    });
  }

  return avisos;
}
