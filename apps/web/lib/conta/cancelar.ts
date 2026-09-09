"use server";

import { createClient } from "@supabase/supabase-js";
import { ETIQUETAS_MEDIDAS, type Medida } from "@apoios/core/taxonomia";

export interface ResultadoCancelamento {
  readonly estado: "tudo" | "medida" | "desconhecido" | "erro";
  readonly medida?: string;
}

/**
 * Apply an unsubscribe from an email link.
 *
 * Uses a bare anon client rather than the session-bound one: whoever clicks a link
 * in an email is, by definition, not signed in, and `cancelar_subscricao` is
 * SECURITY DEFINER precisely so that the token alone is enough. Requiring sign-in
 * to unsubscribe would put an obstacle exactly where the RGPD says to put none.
 */
export async function cancelar(token: string): Promise<ResultadoCancelamento> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return { estado: "erro" };

  const cliente = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await cliente.rpc("cancelar_subscricao", { p_token: token });

  if (error) {
    console.error("[cancelar]", error.message);
    return { estado: "erro" };
  }
  if (data === "desconhecido") return { estado: "desconhecido" };
  if (data === "tudo") return { estado: "tudo" };

  const etiqueta = ETIQUETAS_MEDIDAS[data as Medida];
  return { estado: "medida", medida: etiqueta ?? String(data) };
}
