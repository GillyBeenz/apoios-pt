import type { Apoio, EventoApoio, PerfilUtilizador } from "./tipos.ts";

export interface RazaoNaoCorresponde {
  readonly regra:
    | "nao_alertavel"
    | "sem_medida_comum"
    | "beneficiario_incompativel"
    | "nao_admite_particulares"
    | "fora_do_territorio"
    | "ja_enviado"
    | "utilizador_cancelou";
  readonly detalhe: string;
}

export type ResultadoCorrespondencia =
  | { readonly corresponde: true }
  | { readonly corresponde: false; readonly razao: RazaoNaoCorresponde };

function intersecta<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.some((x) => b.includes(x));
}

/**
 * Decide whether one user should be told about one event.
 *
 * Every rule is conjunctive and every one fails closed. The eligibility rule in
 * particular is what separates this from spam: several major Portuguese programmes
 * (E-Lar is the canonical case) are open only to municipalities, IPSS and
 * residents' associations, and telling a homeowner about one costs them an
 * afternoon of reading a notice they were never able to use.
 *
 * Returns the failing rule rather than a bare boolean so the admin view can show
 * exactly why a fund reached nobody — silence is otherwise indistinguishable from
 * a broken matcher.
 */
export function corresponde(
  evento: EventoApoio,
  apoio: Apoio,
  perfil: PerfilUtilizador,
  jaEnviadas: ReadonlySet<string>,
): ResultadoCorrespondencia {
  if (perfil.cancelouEm !== null) {
    return {
      corresponde: false,
      razao: { regra: "utilizador_cancelou", detalhe: "O utilizador cancelou os alertas." },
    };
  }

  // Withheld extractions never generate email. A fund we are unsure about is
  // listed on the site with a badge, not pushed into someone's inbox.
  if (!evento.alertavel || !apoio.alertavel) {
    return {
      corresponde: false,
      razao: {
        regra: "nao_alertavel",
        detalhe: apoio.needsReview
          ? `Extração por rever: ${apoio.motivoRevisao.join(", ")}`
          : "Evento marcado como não alertável.",
      },
    };
  }

  if (!intersecta(apoio.medidas, perfil.medidas)) {
    return {
      corresponde: false,
      razao: { regra: "sem_medida_comum", detalhe: "Nenhuma medida subscrita coincide." },
    };
  }

  if (!intersecta(apoio.beneficiarios, perfil.tiposBeneficiario)) {
    return {
      corresponde: false,
      razao: {
        regra: "beneficiario_incompativel",
        detalhe: `Destina-se a: ${apoio.beneficiarios.join(", ") || "não especificado"}.`,
      },
    };
  }

  // The fail-closed rule. `desconhecido` is treated exactly like `nao` here — we
  // would rather miss an alert than send someone after money they cannot claim.
  const soParticular =
    perfil.tiposBeneficiario.length === 1 && perfil.tiposBeneficiario[0] === "particular";
  if (soParticular && apoio.admiteParticulares !== "sim") {
    return {
      corresponde: false,
      razao: {
        regra: "nao_admite_particulares",
        detalhe:
          apoio.admiteParticulares === "nao"
            ? "O aviso não admite pessoas singulares."
            : "Elegibilidade de particulares por confirmar.",
      },
    };
  }

  const nacional = apoio.ambito === "nacional" || apoio.ambito === "continente";
  const noConcelho = perfil.concelho !== null && apoio.municipios.includes(perfil.concelho);
  // A user who has not told us where they live only gets national programmes,
  // rather than every municipal one in the country.
  if (!nacional && !noConcelho) {
    return {
      corresponde: false,
      razao: {
        regra: "fora_do_territorio",
        detalhe: `Âmbito ${apoio.ambito}, fora do concelho do utilizador.`,
      },
    };
  }

  if (jaEnviadas.has(evento.impressao)) {
    return {
      corresponde: false,
      razao: { regra: "ja_enviado", detalhe: "Alerta já enviado a este utilizador." },
    };
  }

  return { corresponde: true };
}
