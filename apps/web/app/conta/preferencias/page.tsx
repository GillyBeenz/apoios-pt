import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Medida, TipoBeneficiario } from "@apoios/core";
import { criarClienteServidor } from "@/lib/supabase/servidor.ts";
import { FormularioPreferencias } from "@/components/FormularioPreferencias.tsx";
import { sair } from "@/lib/conta/accoes.ts";
import type { Frequencia } from "@/lib/conta/tipos.ts";

export const metadata: Metadata = { title: "Preferências" };

interface LinhaPerfil {
  tipos_beneficiario: TipoBeneficiario[] | null;
  frequencia: string | null;
}

/**
 * Subscription settings.
 *
 * Every control here used to be `disabled`, with a note explaining that there was a
 * database but no way to sign in, so nothing had anywhere to be saved to. There is
 * now, so the form is live — and the reasoning behind that note still holds: a form
 * that throws the answers away is worse than no form, because someone would set
 * their measures, believe they were subscribed, and hear nothing when their funding
 * opened.
 */
export default async function Preferencias() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/entrar?next=/conta/preferencias");

  const [{ data: perfil }, { data: subscricoes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("tipos_beneficiario, frequencia")
      .eq("id", user.id)
      .maybeSingle<LinhaPerfil>(),
    supabase
      .from("subscriptions")
      .select("medida")
      .eq("user_id", user.id)
      .eq("activa", true)
      .returns<{ medida: string }[]>(),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Preferências de alerta
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-suave">
          Escolha o que quer melhorar em casa. Avisamos quando abrir financiamento a
          que se possa candidatar — e só nesse caso.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tenue">
          <span>Sessão iniciada como {user.email}</span>
          <form action={sair}>
            <button type="submit" className="underline underline-offset-4 hover:text-tinta">
              Terminar sessão
            </button>
          </form>
        </p>
      </div>

      <FormularioPreferencias
        medidas={(subscricoes ?? []).map((s) => s.medida as Medida)}
        beneficiarios={perfil?.tipos_beneficiario ?? ["particular"]}
        frequencia={(perfil?.frequencia ?? "diaria") as Frequencia}
      />

      <p className="text-xs leading-relaxed text-tenue">
        Pode cancelar directamente em qualquer alerta que receber, ou apagar a conta e
        todos os dados a qualquer momento — veja a{" "}
        <Link href="/privacidade" className="underline underline-offset-4">
          política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}
