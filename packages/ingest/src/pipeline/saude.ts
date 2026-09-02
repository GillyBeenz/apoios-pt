export interface MetricasFonte {
  readonly sourceId: string;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly duracaoMs: number;
  readonly candidatos: number;
  readonly candidatosComData: number;
  readonly extraccoesOk: number;
  readonly extraccoesRevisao: number;
  readonly provasFalhadas: number;
  readonly tokensCacheLidos: number;
  readonly chamadasModelo: number;
  readonly erro: string | null;
}

export interface Alarme {
  readonly regra: string;
  readonly gravidade: "aviso" | "critico";
  readonly mensagem: string;
}

export interface HistoricoFonte {
  /** Candidate counts from the last few successful runs, newest first. */
  readonly candidatosRecentes: readonly number[];
  readonly falhasConsecutivas: number;
  readonly horasDesdeMudancaConteudo: number | null;
}

function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? ((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2
    : (ordenados[meio] ?? 0);
}

/**
 * Detect a scraper that has broken without failing.
 *
 * The dangerous failure here is not an exception — that is loud and obvious. It is
 * a site redesign that leaves `extrair()` returning zero rows while the run reports
 * success, so nobody is told about any funding for six weeks and nothing anywhere
 * looks wrong. Every rule below exists to make that state noisy.
 */
export function avaliarSaude(
  m: MetricasFonte,
  historico: HistoricoFonte,
  candidatosMin: number,
  cadenciaHoras: number,
): Alarme[] {
  const alarmes: Alarme[] = [];
  const base = mediana(historico.candidatosRecentes);

  if (m.erro !== null && historico.falhasConsecutivas >= 1) {
    alarmes.push({
      regra: "falhas_consecutivas",
      gravidade: "critico",
      mensagem: `${m.sourceId}: ${historico.falhasConsecutivas + 1} execuções seguidas com erro (${m.erro}).`,
    });
  }

  if (m.erro === null) {
    // The classic silent break.
    if (m.candidatos === 0 && base > 0) {
      alarmes.push({
        regra: "zero_candidatos",
        gravidade: "critico",
        mensagem: `${m.sourceId}: 0 candidatos, mediana recente ${base}. Selector provavelmente partido.`,
      });
    } else if (m.candidatos < candidatosMin) {
      alarmes.push({
        regra: "abaixo_do_minimo",
        gravidade: "critico",
        mensagem: `${m.sourceId}: ${m.candidatos} candidatos, mínimo esperado ${candidatosMin}.`,
      });
    } else if (base > 0 && m.candidatos < base * 0.4) {
      alarmes.push({
        regra: "queda_de_candidatos",
        gravidade: "aviso",
        mensagem: `${m.sourceId}: ${m.candidatos} candidatos vs mediana ${base}. Selector parcialmente partido?`,
      });
    }

    // The listing still parses but every entry lost its date — a distinct break
    // that a raw candidate count would hide completely.
    if (m.candidatos > 0 && m.candidatosComData === 0) {
      alarmes.push({
        regra: "sem_datas",
        gravidade: "aviso",
        mensagem: `${m.sourceId}: ${m.candidatos} candidatos mas nenhum com data reconhecível.`,
      });
    }
  }

  // A page frozen for weeks is either genuinely dormant or, more often, a cached
  // error page that hashes stably. Both deserve a look.
  if (
    historico.horasDesdeMudancaConteudo !== null &&
    historico.horasDesdeMudancaConteudo > cadenciaHoras * 21
  ) {
    alarmes.push({
      regra: "conteudo_congelado",
      gravidade: "aviso",
      mensagem: `${m.sourceId}: sem alteração de conteúdo há ${Math.round(historico.horasDesdeMudancaConteudo)}h.`,
    });
  }

  const totalExtraccoes = m.extraccoesOk + m.extraccoesRevisao;
  if (totalExtraccoes > 0) {
    if (m.extraccoesRevisao / totalExtraccoes > 0.4) {
      alarmes.push({
        regra: "muitas_revisoes",
        gravidade: "aviso",
        mensagem: `${m.sourceId}: ${m.extraccoesRevisao}/${totalExtraccoes} extrações por rever. Formato mudou?`,
      });
    }
    if (m.provasFalhadas / totalExtraccoes > 0.2) {
      alarmes.push({
        regra: "provas_falhadas",
        gravidade: "critico",
        mensagem: `${m.sourceId}: ${m.provasFalhadas}/${totalExtraccoes} extrações com citações inexistentes.`,
      });
    }
  }

  // Zero cache reads across a run of several documents means the cached prefix is
  // being invalidated and the bill is roughly ten times what it should be.
  if (m.chamadasModelo > 1 && m.tokensCacheLidos === 0) {
    alarmes.push({
      regra: "cache_nao_lida",
      gravidade: "aviso",
      mensagem: `${m.sourceId}: ${m.chamadasModelo} chamadas ao modelo e 0 tokens lidos da cache.`,
    });
  }

  return alarmes;
}
