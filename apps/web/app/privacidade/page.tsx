import type { Metadata } from "next";
export const metadata: Metadata = { title: "Política de privacidade" };

export default function Privacidade() {
  return (
    <div className="max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidade</h1>

      <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Documento por completar. Antes de qualquer lançamento público é necessário
        identificar o responsável pelo tratamento com nome e contacto reais — sem
        isso esta política não cumpre o RGPD.
      </div>

      <h2 className="text-lg font-medium pt-2">Que dados tratamos</h2>
      <p>
        Endereço de email, e opcionalmente nome, concelho, tipo de beneficiário, as
        medidas que subscreveu e o histórico de alertas enviados. Nada mais.
      </p>

      <h2 className="text-lg font-medium pt-2">Com que fundamento</h2>
      <p>
        Execução do serviço que subscreveu (art. 6.º, n.º 1, al. b) do RGPD), com
        consentimento expresso recolhido no registo. Guardamos a data e a versão do
        texto que aceitou.
      </p>

      <h2 className="text-lg font-medium pt-2">Quem tem acesso</h2>
      <p>
        Subcontratantes: Supabase (base de dados e autenticação), Vercel (alojamento)
        e Resend (envio de email). A leitura automática dos avisos usa a API da
        Anthropic, à qual são enviados <strong>apenas documentos públicos</strong> —
        nunca dados pessoais.
      </p>

      <h2 className="text-lg font-medium pt-2">Os seus direitos</h2>
      <p>
        Acesso, retificação, apagamento, limitação, portabilidade e oposição
        (art. 15.º a 22.º do RGPD). Pode exportar ou apagar a sua conta a qualquer
        momento. Tem ainda o direito de reclamar junto da CNPD.
      </p>

      <h2 className="text-lg font-medium pt-2">Cookies</h2>
      <p>
        Usamos apenas o cookie de sessão estritamente necessário ao início de sessão.
        Não usamos analítica nem cookies de terceiros.
      </p>
    </div>
  );
}
