import { afterEach, describe, expect, it } from "vitest";
import { paraApoio } from "./supabase.ts";
import { repositorio, reiniciarRepositorio } from "./index.ts";
import { RepositorioSeed } from "./seed.ts";

/** A row shaped as Postgres returns it, with the columns the catalogue reads. */
const LINHA = {
  id: "0d1f",
  slug: "solar-2026",
  source_id: "fundo-ambiental-aac",
  titulo: "Apoio a painéis solares",
  resumo: null,
  programa_pai: null,
  entidade_gestora: null,
  referencia_legal: "AVISO 02/2026",
  estado: "aberto",
  dotacao_esgotada: false,
  abre_em: "2026-09-01T00:00:00+00:00",
  abre_em_precisao: "dia",
  fecha_em: "2026-10-31T22:59:59+00:00",
  fecha_em_precisao: "mes",
  beneficiarios: ["particular"],
  admite_particulares: "sim",
  restricoes_beneficiario: null,
  ambito: "nacional",
  municipios: [],
  medidas: ["solar_fotovoltaico"],
  medidas_por_classificar: [],
  detalhe_apoios: [],
  dotacao_total_eur: "1500000.00",
  apoio_max_eur: "15000.00",
  url_oficial: "https://www.fundoambiental.pt/x.aspx",
  url_candidatura: null,
  documentos: [],
  needs_review: false,
  motivo_revisao: [],
  confianca_global: "alta",
  publicado: true,
  alertavel: true,
  visto_pela_primeira_vez: "2026-09-01T00:00:00+00:00",
  visto_pela_ultima_vez: "2026-09-03T00:00:00+00:00",
  actualizado_em: "2026-09-03T00:00:00+00:00",
};

describe("paraApoio", () => {
  it("mantém a data e a sua precisão juntas", () => {
    // Separating them is exactly how a deadline known only to the month ends up
    // rendered as an exact day.
    const a = paraApoio(LINHA);
    expect(a.fechaEm).toEqual({
      iso: "2026-10-31T22:59:59+00:00",
      precisao: "mes",
      textoFonte: null,
    });
    expect(a.abreEm.precisao).toBe("dia");
  });

  it("lê montantes numéricos que o Postgres devolve como texto", () => {
    const a = paraApoio(LINHA);
    expect(a.dotacaoTotalEur).toBe(1500000);
    expect(a.apoioMaxEur).toBe(15000);
    expect(paraApoio({ ...LINHA, apoio_max_eur: null }).apoioMaxEur).toBeNull();
  });

  it("falha fechada na elegibilidade", () => {
    // Only a literal `sim` or `nao` is taken at face value. Anything else — absent,
    // misspelled, a value added to the enum later — becomes `desconhecido`, which
    // blocks an alert exactly as `nao` does.
    expect(paraApoio(LINHA).admiteParticulares).toBe("sim");
    expect(paraApoio({ ...LINHA, admite_particulares: "nao" }).admiteParticulares).toBe("nao");
    for (const v of [null, undefined, "", "talvez", "SIM", true]) {
      expect(
        paraApoio({ ...LINHA, admite_particulares: v }).admiteParticulares,
        String(v),
      ).toBe("desconhecido");
    }
  });

  it("trata needs_review como verdadeiro salvo prova em contrário", () => {
    // A missing column must not quietly promote an unreviewed fund to trustworthy.
    expect(paraApoio({ ...LINHA, needs_review: false }).needsReview).toBe(false);
    expect(paraApoio({ ...LINHA, needs_review: undefined }).needsReview).toBe(true);
    expect(paraApoio({ ...LINHA, needs_review: null }).needsReview).toBe(true);
  });

  it("nunca inventa um url oficial nem publicado", () => {
    expect(paraApoio(LINHA).urlOficial).toBe("https://www.fundoambiental.pt/x.aspx");
    expect(paraApoio({ ...LINHA, publicado: undefined }).publicado).toBe(false);
    expect(paraApoio({ ...LINHA, alertavel: undefined }).alertavel).toBe(false);
  });

  it("aguenta arrays em falta", () => {
    const a = paraApoio({ ...LINHA, medidas: null, beneficiarios: undefined });
    expect(a.medidas).toEqual([]);
    expect(a.beneficiarios).toEqual([]);
  });
});

describe("repositorio — escolha do armazenamento", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (chave === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chave;
    reiniciarRepositorio();
  });

  it("usa os dados de exemplo sem configuração nenhuma", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    reiniciarRepositorio();
    expect(repositorio()).toBeInstanceOf(RepositorioSeed);
  });

  it("recusa-se a arrancar meio configurado", () => {
    // Falling back to the seed here would serve seven invented funds from a
    // production URL. Better to fail loudly at boot.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    reiniciarRepositorio();
    expect(() => repositorio()).toThrow(/incompleta/i);

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave";
    reiniciarRepositorio();
    expect(() => repositorio()).toThrow(/incompleta/i);
  });
});
