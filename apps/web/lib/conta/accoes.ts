"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BENEFICIARIOS_PROPRIETARIO,
  TAXONOMIA_MEDIDAS,
  type Medida,
  type TipoBeneficiario,
} from "@apoios/core";
import { criarClienteServidor } from "@/lib/supabase/servidor.ts";
import { urlAbsoluto } from "@/lib/sitio.ts";
import {
  FREQUENCIAS,
  VERSAO_CONSENTIMENTO,
  type EstadoFormulario,
  type Frequencia,
} from "./tipos.ts";

/** Send the magic link. */
export async function pedirLigacao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const email = String(dados.get("email") ?? "").trim();
  // Deliberately loose. The real check is that a link arrives and gets clicked;
  // a stricter pattern only rejects addresses that are in fact deliverable.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Escreva um endereço de email válido." };
  }

  const aceitou = dados.get("consentimento") === "sim";
  if (!aceitou) {
    return { erro: "Para receber alertas por email é necessário aceitar a política de privacidade." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: urlAbsoluto("/auth/confirmar"),
      // Consent travels with the sign-in request and lands in the user's metadata,
      // so the record exists from the very first link even if they never open the
      // preferences page. `guardarPreferencias` copies it onto the profile row.
      data: {
        consentimento_versao: VERSAO_CONSENTIMENTO,
        consentimento_em: new Date().toISOString(),
      },
    },
  });

  if (error) {
    // Never surfaced verbatim: Supabase's message distinguishes "unknown address"
    // from "rate limited", which would turn this form into an account oracle.
    console.error("[entrar] signInWithOtp falhou:", error.message);
    return { erro: "Não foi possível enviar a ligação. Tente novamente daqui a pouco." };
  }

  return { guardado: true };
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/");
}

function medidasValidas(valores: readonly string[]): Medida[] {
  const conhecidas = new Set<string>(TAXONOMIA_MEDIDAS);
  return valores.filter((v): v is Medida => conhecidas.has(v));
}

function beneficiariosValidos(valores: readonly string[]): TipoBeneficiario[] {
  const conhecidos = new Set<string>(BENEFICIARIOS_PROPRIETARIO);
  return valores.filter((v): v is TipoBeneficiario => conhecidos.has(v));
}

/**
 * Save preferences.
 *
 * Everything is filtered against the taxonomy before it reaches the database. Not
 * because RLS would let a stray value through — it would — but because a measure
 * that is not in `TAXONOMIA_MEDIDAS` can never match a fund, so storing it would
 * quietly subscribe someone to nothing at all.
 */
export async function guardarPreferencias(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "A sessão expirou. Volte a entrar." };

  const medidas = medidasValidas(dados.getAll("medida").map(String));
  const beneficiarios = beneficiariosValidos(dados.getAll("beneficiario").map(String));
  const frequenciaBruta = String(dados.get("frequencia") ?? "diaria");
  const frequencia: Frequencia = (FREQUENCIAS as readonly string[]).includes(
    frequenciaBruta,
  )
    ? (frequenciaBruta as Frequencia)
    : "diaria";

  if (beneficiarios.length === 0) {
    return { erro: "Escolha pelo menos uma forma de se candidatar." };
  }

  const consentimentoEm =
    (user.user_metadata?.consentimento_em as string | undefined) ??
    new Date().toISOString();
  const consentimentoVersao =
    (user.user_metadata?.consentimento_versao as string | undefined) ??
    VERSAO_CONSENTIMENTO;

  // The profile row does not exist until now: signing in creates `auth.users`, and
  // nothing creates `profiles`. Upserting here rather than adding a trigger keeps
  // the write inside RLS, where `with check (id = auth.uid())` is what guarantees a
  // session can only ever write its own row.
  const { error: erroPerfil } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      tipos_beneficiario: beneficiarios,
      frequencia,
      consentimento_em: consentimentoEm,
      consentimento_versao: consentimentoVersao,
      cancelou_em: null,
    },
    { onConflict: "id" },
  );
  if (erroPerfil) {
    console.error("[preferencias] perfil:", erroPerfil.message);
    return { erro: "Não foi possível guardar. Tente novamente." };
  }

  // Measures are deactivated rather than deleted, so `subscriptions.criado_em`
  // still answers "since when has this person followed solar?" after they toggle
  // it off and on again.
  const { error: erroDesactivar } = await supabase
    .from("subscriptions")
    .update({ activa: false })
    .eq("user_id", user.id);
  if (erroDesactivar) {
    console.error("[preferencias] desactivar:", erroDesactivar.message);
    return { erro: "Não foi possível guardar. Tente novamente." };
  }

  if (medidas.length > 0) {
    const { error: erroMedidas } = await supabase.from("subscriptions").upsert(
      medidas.map((medida) => ({ user_id: user.id, medida, activa: true })),
      { onConflict: "user_id,medida" },
    );
    if (erroMedidas) {
      console.error("[preferencias] medidas:", erroMedidas.message);
      return { erro: "Não foi possível guardar. Tente novamente." };
    }
  }

  revalidatePath("/conta/preferencias");
  return { guardado: true };
}
