import type { Metadata } from "next";
export const metadata: Metadata = { title: "Política de privacidade" };

export default function Privacidade() {
  return (
    <div className="max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidade</h1>

      <h2 className="text-lg font-medium pt-2">Quem é o responsável</h2>
      <p>
        O responsável pelo tratamento dos seus dados é <strong>Gil Pina Cabral</strong>,
        pessoa singular, contactável em{" "}
        <a className="underline" href="mailto:rgpd@appoios.guru">
          rgpd@appoios.guru
        </a>
        .
      </p>
      <p className="text-sm text-suave">
        O Appoios não é uma empresa. É um serviço mantido por uma pessoa, e o art.
        13.º, n.º 1, al. a) do RGPD exige que essa pessoa se identifique pelo nome —
        não basta um endereço de contacto. Não há encarregado de proteção de dados
        porque o art. 37.º não o impõe a um tratamento desta natureza e escala: não
        somos autoridade pública, não fazemos controlo sistemático em larga escala,
        e não tratamos categorias especiais de dados.
      </p>

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
        Não usamos analítica nem cookies de terceiros. Contamos quantas visitas
        chegam por cada um dos nossos domínios — só isso, um número por dia e por
        domínio, sem endereço IP, sem cookie e sem a página visitada. Serve para
        decidir se vale a pena manter o segundo domínio registado, e não permite
        identificar ninguém.
      </p>

      <h2 className="text-lg font-medium pt-2">Como nos contactar</h2>
      <p>
        Para exercer qualquer um destes direitos, escreva para{" "}
        <a className="underline" href="mailto:rgpd@appoios.guru">
          rgpd@appoios.guru
        </a>
        . É uma caixa monitorizada por uma pessoa, não um formulário automático.
        Respondemos dentro do prazo de um mês previsto no art. 12.º, n.º 3 do RGPD.
      </p>
    </div>
  );
}
