import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { formaComparavel } from "@apoios/core";
import { dataDoPdf, textoDoPdf } from "./pdf.ts";

/**
 * A PDF built here, rather than captured.
 *
 * The real fixture below proves the reader works on a document nobody here
 * wrote. This one proves the operator semantics, which a captured file cannot:
 * the producer that made it happens never to use a `TJ` kerning gap or an octal
 * escape, so a test that only read that file would leave both branches unproven.
 */
function pdfComStream(conteudo: string): Uint8Array {
  const comprimido = deflateSync(Buffer.from(conteudo, "latin1"));
  const cabecalho = Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /Length " +
      String(comprimido.length) +
      " /Filter /FlateDecode >>\nstream\n",
    "latin1",
  );
  const cauda = Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1");
  return Buffer.concat([cabecalho, comprimido, cauda]);
}

describe("textoDoPdf", () => {
  it("lê o texto de dentro de um stream comprimido", () => {
    const pdf = pdfComStream("BT /F1 12 Tf (Candidaturas abertas) Tj ET");
    expect(textoDoPdf(pdf)).toBe("Candidaturas abertas");
  });

  it("junta os pedaços de um array TJ sem os separar", () => {
    // É assim que um PDF real guarda uma palavra: cortada em literais, com o
    // ajuste de espacejamento pelo meio. Separá-los por espaços — o que o leitor
    // anterior fazia — desfaz todas as palavras do documento.
    const pdf = pdfComStream("BT [(O)-5(s) 8( F)1(u)1(n)1(d)2(o)8(s)] TJ ET");
    expect(textoDoPdf(pdf)).toBe("Os Fundos");
  });

  it("trata um recuo grande dentro do array como espaço", () => {
    const pdf = pdfComStream("BT [(Aviso)-350(aberto)] TJ ET");
    expect(textoDoPdf(pdf)).toBe("Aviso aberto");
  });

  it("descodifica o octal, que é onde vivem os acentos", () => {
    // \347 = ç, \343 = ã, \355 = í.
    const pdf = pdfComStream("BT (Altera\\347\\343o do aviso eleg\\355vel) Tj ET");
    expect(textoDoPdf(pdf)).toBe("Alteração do aviso elegível");
  });

  it("descodifica os parênteses escapados sem se perder a contar", () => {
    const pdf = pdfComStream("BT (a al\\355nea a\\051 do artigo) Tj ET");
    expect(textoDoPdf(pdf)).toBe("a alínea a) do artigo");
  });

  it("separa o que foi impresso em posições diferentes", () => {
    const pdf = pdfComStream(
      "BT 1 0 0 1 50 700 Tm (Prazo) Tj 1 0 0 1 50 680 Tm (30 dias) Tj ET",
    );
    expect(textoDoPdf(pdf)).toBe("Prazo 30 dias");
  });

  it("ignora os operandos dos operadores que não são de texto", () => {
    // `/GS0 gs` e o `re`/`W n` do recorte aparecem entre o texto em qualquer
    // documento real. Nada disso é texto.
    const pdf = pdfComStream(
      "q 49.32 23.52 198.24 14.76 re W n /GS0 gs BT (Elegível) Tj ET Q",
    );
    expect(textoDoPdf(pdf)).toBe("Elegível");
  });

  it("devolve vazio sem bytes, que é uma resposta e não um erro", () => {
    expect(textoDoPdf(null)).toBe("");
    expect(textoDoPdf(new Uint8Array())).toBe("");
  });

  it("devolve vazio para um PDF sem camada de texto", () => {
    // Um aviso digitalizado. A consequência honesta é a fila de revisão.
    expect(textoDoPdf(pdfComStream("q 1 0 0 1 0 0 cm /Im0 Do Q"))).toBe("");
  });
});

const AVISO_REAL = new URL(
  "../sources/comum/fixtures-permanentes/pt2030-aviso-lisboa2030-2023-12-alteracao.pdf",
  import.meta.url,
);

describe("textoDoPdf, contra um aviso a sério", () => {
  const bytes = readFileSync(AVISO_REAL);
  const texto = textoDoPdf(bytes);

  it("lê português, e não o binário comprimido que o leitor anterior lia", () => {
    // O leitor anterior devolvia 170 960 caracteres para o aviso grande desta
    // mesma fonte, e não continha uma única palavra portuguesa: raspava
    // parênteses de dentro dos streams comprimidos. É este o caso que motiva o
    // módulo, por isso está aqui escrito como asserção e não como comentário.
    expect(texto).toContain("ALTERAÇÃO DO AVISO");
    expect(texto).toContain("Período de candidaturas");
    expect(texto).toContain("Comissão Diretiva");
  });

  it("dá texto que serve para verificar uma citação", () => {
    // O portão compara com `formaComparavel`. Um texto que não sobrevive a essa
    // comparação não serve para nada, por muito legível que pareça.
    const citacao = "A Comissão Diretiva deliberou proceder à alteração do aviso";
    expect(formaComparavel(texto)).toContain(formaComparavel(citacao));
  });
});

const BLOB_INEXISTENTE = new URL(
  "../sources/comum/fixtures-permanentes/pt2030-download-blob-inexistente-200.xml",
  import.meta.url,
);

describe("textoDoPdf, contra a resposta que finge ser um documento", () => {
  it("não inventa texto a partir de um erro servido com HTTP 200", () => {
    // O PT2030 lista um documento cujo blob não existe, e o Azure responde 200
    // com 215 bytes de XML. Não é um caso hipotético: é o
    // `NORTE2030-2024-80 … _Rep_março2025.pdf`, e repete-se em três tentativas.
    // O que importa aqui é que o leitor devolve vazio em vez de raspar palavras
    // da mensagem de erro — `BlobNotFound`, `RequestId` — e as dar por texto do
    // aviso. Detectar a resposta é trabalho da fase de detalhe, não deste módulo.
    expect(textoDoPdf(readFileSync(BLOB_INEXISTENTE))).toBe("");
    expect(dataDoPdf(readFileSync(BLOB_INEXISTENTE))).toBeNull();
  });
});

describe("dataDoPdf", () => {
  it("lê a data de dentro do object stream comprimido", () => {
    // O dicionário Info de um PDF moderno não está em texto claro. Procurar só
    // nos bytes crus não encontra nada — é o que uma primeira medição deste
    // repositório concluiu, erradamente, para 67 documentos.
    expect(dataDoPdf(readFileSync(AVISO_REAL))).toBe("2025-07-08T16:52:14");
  });

  it("prefere ModDate a CreationDate", () => {
    // Uma republicação feita a partir do mesmo Word mantém a data de criação e
    // ganha data de modificação. É a segunda que ordena as versões.
    const pdf = pdfComStream(
      "<< /CreationDate (D:20240229215930+00'00') /ModDate (D:20250415160557+01'00') >>",
    );
    expect(dataDoPdf(pdf)).toBe("2025-04-15T16:05:57");
  });

  it("aceita uma data curta, sem hora", () => {
    expect(dataDoPdf(pdfComStream("<< /ModDate (D:20260717) >>"))).toBe(
      "2026-07-17T00:00:00",
    );
  });

  it("devolve null quando não há data, em vez de inventar uma", () => {
    expect(dataDoPdf(pdfComStream("BT (sem metadados) Tj ET"))).toBeNull();
    expect(dataDoPdf(null)).toBeNull();
  });
});
