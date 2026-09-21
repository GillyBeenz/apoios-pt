/**
 * Reading a PDF's text layer, without a parser and without the network.
 *
 * The pipeline needs two things out of a PDF, and only two. The text, so an
 * evidence quote can be checked against the document the model read; and the
 * production date, so several versions of the same aviso can be put in order.
 * Neither needs a full parser, and a full parser is a dependency this package
 * does not have.
 *
 * What it replaces mattered more than what it adds. The previous reader scraped
 * `(...)` literals straight out of the raw bytes. In a modern PDF every content
 * stream is `FlateDecode`d, so what it scraped were parentheses that happen to
 * occur inside compressed binary — on a real Portugal 2030 aviso it returned
 * 170 960 characters, of which not one was a Portuguese word. Verification runs
 * against that string, so every quote the model produced would have failed, every
 * field would have been forced to `baixa`, and the notice would have landed in the
 * review queue having cost a paid model call. The same document read here yields
 * 49 642 characters of the actual notice.
 */

import { inflateSync } from "node:zlib";

const ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
};

/** `\(`, `\\`, `\n` and the octal `\351` that carries every accented letter. */
function descodificarLiteral(s: string): string {
  if (!s.includes("\\")) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const p = s[++i];
    if (p === undefined) break;
    if (p >= "0" && p <= "7") {
      let oct = p;
      while (oct.length < 3) {
        const seguinte = s[i + 1];
        if (seguinte === undefined || seguinte < "0" || seguinte > "7") break;
        oct += s[++i];
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (ESCAPES[p] !== undefined) {
      out += ESCAPES[p];
    } else if (p !== "\n") {
      out += p;
    }
  }
  return out;
}

/**
 * Every stream in the file, inflated where it inflates.
 *
 * Deliberately not driven by the cross-reference table: a damaged or
 * linearised xref is common enough in documents published by hand, and the
 * point here is to get at the text, not to be a conforming reader. Streams that
 * are not Flate — JPEGs, fonts, signatures — throw and are dropped.
 */
function streamsInflados(bytes: Uint8Array): string[] {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = b.toString("latin1");
  const partes: string[] = [];
  let i = 0;
  for (;;) {
    const j = s.indexOf("stream", i);
    if (j === -1) break;
    let k = j + 6;
    if (s[k] === "\r") k++;
    if (s[k] === "\n") k++;
    const fim = s.indexOf("endstream", k);
    if (fim === -1) break;
    try {
      partes.push(inflateSync(b.subarray(k, fim)).toString("latin1"));
    } catch {
      // Not a Flate stream, or truncated. Either way there is no text in it.
    }
    i = fim + 9;
  }
  return partes;
}

/**
 * A kerning adjustment more negative than this counts as a space.
 *
 * Inside a `TJ` array the numbers are thousandths of an em, moved *backwards*,
 * and a word gap is the only reason to move that far. The threshold is a
 * judgement, not a rule from the spec: too low and every letter pair becomes a
 * word boundary, too high and words run together. Verification normalises
 * whitespace before comparing, so erring towards more spaces is the cheap side.
 */
const RECUO_QUE_VALE_ESPACO = -120;

/**
 * Text out of one content stream.
 *
 * Hand-written scanner rather than a regular expression: the shape being matched
 * is `[(a) -5 (b)] TJ`, and a regex for it needs nested quantifiers, which on a
 * 25 KB stream backtracks for minutes.
 *
 * The join matters as much as the scan. A `TJ` array holds one document word cut
 * into a dozen literals with kerning between them — `[(O)-5(s)8( F)1(u)...]` is
 * "Os Fu…". Joining those with a space, which the previous reader did, shreds
 * every word in the document into letters.
 */
function textoDoStream(t: string): string {
  const saida: string[] = [];
  let ultimo = "";
  const emitir = (s: string): void => {
    if (s.length === 0) return;
    saida.push(s);
    ultimo = s[s.length - 1]!;
  };
  const espaco = (): void => {
    if (ultimo !== "" && ultimo !== " " && ultimo !== "\n") emitir(" ");
  };

  let pendentes: string[] = [];
  let i = 0;
  const n = t.length;

  while (i < n) {
    const c = t.charCodeAt(i);

    if (c === 40 /* ( */) {
      let j = i + 1;
      let prof = 1;
      const ini = j;
      while (j < n) {
        const d = t.charCodeAt(j);
        if (d === 92 /* \ */) {
          j += 2;
          continue;
        }
        if (d === 40) prof++;
        else if (d === 41 /* ) */ && --prof === 0) break;
        j++;
      }
      pendentes.push(descodificarLiteral(t.slice(ini, j)));
      i = j + 1;
      continue;
    }

    if ((c >= 48 && c <= 57) || c === 45 /* - */ || c === 46 /* . */) {
      let j = i;
      while (j < n) {
        const d = t.charCodeAt(j);
        if ((d >= 48 && d <= 57) || d === 45 || d === 46) j++;
        else break;
      }
      if (pendentes.length > 0 && Number(t.slice(i, j)) < RECUO_QUE_VALE_ESPACO) {
        pendentes.push(" ");
      }
      i = j;
      continue;
    }

    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      c === 42 /* * */ ||
      c === 39 /* ' */ ||
      c === 34 /* " */
    ) {
      let j = i;
      while (j < n) {
        const d = t.charCodeAt(j);
        if (
          (d >= 65 && d <= 90) ||
          (d >= 97 && d <= 122) ||
          (d >= 48 && d <= 57) ||
          d === 42 ||
          d === 39 ||
          d === 34
        ) {
          j++;
        } else break;
      }
      const op = t.slice(i, j);
      if (op === "Tj" || op === "TJ") {
        emitir(pendentes.join(""));
        pendentes = [];
      } else if (op === "'" || op === '"') {
        // Both move to the next line before showing the string.
        espaco();
        emitir(pendentes.join(""));
        pendentes = [];
      } else if (
        op === "Td" ||
        op === "TD" ||
        op === "Tm" ||
        op === "T*" ||
        op === "ET"
      ) {
        // The pen moved without printing: a line or a cell boundary.
        pendentes = [];
        espaco();
      } else {
        // Any other operator consumed its operands; they are not text.
        pendentes = [];
      }
      i = j;
      continue;
    }

    i++;
  }

  return saida.join("");
}

/**
 * The document's text, or `""` when there is none to be had.
 *
 * An empty result is a real answer and not an error: a scanned aviso has no text
 * layer at all, and the honest consequence is that its evidence cannot be
 * verified and the extraction goes to review.
 */
export function textoDoPdf(bytes: Uint8Array | null): string {
  if (!bytes || bytes.length === 0) return "";
  return streamsInflados(bytes)
    .filter((p) => p.includes("TJ") || p.includes("Tj"))
    .map(textoDoStream)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const CAMPOS_DE_DATA = ["ModDate", "CreationDate"] as const;

/**
 * When the file was produced, as `YYYY-MM-DDTHH:MM:SS`, or `null`.
 *
 * `ModDate` first, `CreationDate` as fallback: a notice republished from the same
 * Word document keeps its creation date and gets a new modification date.
 *
 * This is the producer's clock, not a signature, and it says when the *file* was
 * made — not when the aviso was signed. Of 52 documents on 12 Portugal 2030
 * notices, three carried a digital signature and all 52 carried this date. It is
 * the only witness there is, which is a reason to use it and also a reason to
 * write down what it is not.
 *
 * The offset in the PDF (`+01'00'`) is dropped rather than applied. Turning it
 * into UTC would be arithmetic on a field these producers fill inconsistently —
 * the same publisher writes `Z`, `+00'00'` and `+01'00'` — and the only use for
 * this value is ordering versions of one notice, which are produced in one place.
 */
export function dataDoPdf(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null;
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The Info dictionary usually lives inside a compressed object stream, so the
  // raw bytes are searched first and the inflated ones after.
  const fontes = [b.toString("latin1"), ...streamsInflados(bytes)];
  for (const campo of CAMPOS_DE_DATA) {
    const re = new RegExp(`\\/${campo}\\s*\\(D:(\\d{8,14})`);
    for (const fonte of fontes) {
      const m = re.exec(fonte);
      if (m === null) continue;
      const d = m[1]!.padEnd(14, "0");
      return (
        `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` +
        `T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}`
      );
    }
  }
  return null;
}
