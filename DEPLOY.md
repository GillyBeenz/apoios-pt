# Deploy

## Vercel — a única definição que importa

**Settings → General → Root Directory = `apps/web`.**

Sem isto a Vercel constrói a raiz do repositório, não encontra nenhuma app Next
e o deploy fica vazio ou falha. É a causa mais comum de um deploy "com sucesso"
que não serve nada.

O resto é herdado do repositório e não precisa de ser configurado à mão:

| Definição | Valor | Onde vem |
|---|---|---|
| Framework | Next.js | `apps/web/vercel.json` |
| Gestor de pacotes | pnpm 10.33 | `packageManager` em `package.json` |
| Node | 22.x | `engines.node` |
| Build | `next build` | detectado |

`Include source files outside of the Root Directory` tem de ficar **ligada** (é o
que já vem por omissão num monorepo): `apps/web` depende de `@apoios/core` por
`workspace:*`, e sem os ficheiros de fora da raiz o `pnpm install` não resolve
essa dependência.

## O que está e o que não está publicado

A app corre neste momento sobre **dados de exemplo** (`apps/web/lib/dados/seed.ts`),
não sobre apoios reais. Isto é deliberado: o catálogo foi construído para poder ser
visto e testado antes de existir base de dados. Um visitante vê uma lista de apoios
plausível mas fictícia.

Antes de mostrar isto a alguém que possa agir sobre a informação, é preciso a Fase 4
— Supabase e Resend — para que os dados sejam os reais. Até lá vale a pena manter o
deploy protegido (Vercel → Settings → Deployment Protection), porque a informação
de financiamento errada é exactamente o dano que este produto existe para evitar.

## Domínio

A app chama-se **Appoios** e vive em **`appoios.guru`**. O **`apoios.guru`** foi
registado como defensivo e redirige (308) para o canónico.

Ambos na Namecheap.

Nada no código o tem escrito à mão. O `urlDoSitio()` resolve a origem por esta ordem:
`NEXT_PUBLIC_APP_URL` → domínio de produção da Vercel → localhost. É deliberado: um
literal no `metadataBase` emitia canónicos e Open Graph a apontar para um host que
podia nem servir o site, e a ligação mágica de entrada é construída a partir da mesma
origem — se estiver errada, a ligação que chega ao email não abre.

A única excepção é o `USER_AGENT` do recolector (`packages/ingest/src/http/tipos.ts`),
que é uma constante: o URL e o endereço que ali estão são a forma de um operador do
Fundo Ambiental distinguir um leitor bem-comportado de um scraper, e o único canal
que tem para pedir que abrande. Têm de resolver e de receber correio a sério.

### O que é preciso fazer fora do repositório

| onde | o quê |
|---|---|
| Vercel → Domains | adicionar `appoios.guru`, `www.appoios.guru`, `apoios.guru`, `www.apoios.guru`; copiar os registos que a Vercel mostrar |
| Namecheap → Advanced DNS | criar esses registos (a Vercel dá os valores exactos; não os adivinhe) |
| Vercel → Environment Variables | `NEXT_PUBLIC_APP_URL=https://appoios.guru` |
| Supabase → Authentication → URL Configuration | Site URL `https://appoios.guru`; Redirect URLs incluindo `https://appoios.guru/auth/confirmar` |
| Supabase → Authentication → Email Templates → Magic Link | apontar para `/auth/confirmar` com `{{ .TokenHash }}` — **não** `{{ .ConfirmationURL }}` |
| Resend → Domains | verificar `appoios.guru` (região `eu-west-1`, envio **e** recepção) |
| Namecheap → Advanced DNS → Mail Settings | pôr em **Custom MX** — enquanto estiver em *Email Forwarding* o MX da raiz é ignorado e o correio de entrada nunca chega ao Resend |
| Resend → Webhooks | subscrever `email.received` para `https://appoios.guru/api/correio-entrada`; guardar o `whsec_…` |

### Que host é o verdadeiro

`appoios.guru`, sem `www`. Está em `lib/dominios.ts` como `CANONICO`, e os outros
três — `apoios.guru`, `www.apoios.guru`, `www.appoios.guru` — levam 308 para lá.

O `www.appoios.guru` está lá por razão diferente dos outros dois. Aqueles são o
registo defensivo. O `www` é o mesmo domínio de chapéu: a Vercel serve-o porque
está listado no projecto, e deixado em paz responde no seu próprio hostname —
conteúdo duplicado para um motor de busca e, pior, um cookie de sessão posto num
dos hosts é invisível ao outro. Entrar no `www` e voltar mais tarde ao canónico
parece ficar sem sessão sem razão nenhuma.

**Se algum dia se configurar a Vercel para redirigir o ápex *para* o www**, o
`www.appoios.guru` tem de sair do `NAO_CANONICOS` na mesma alteração. O
redireccionamento da Vercel corre na berma, antes do middleware, e as duas regras
a apontar uma para a outra é um ciclo infinito.

Por isso o Site URL do Supabase, o `NEXT_PUBLIC_APP_URL` e tudo o que peça um URL
canónico levam `https://appoios.guru`.

### O defensivo vale a renovação?

O redireccionamento é contado. A migração `0006` cria `dominio_acessos` — um contador
por dia e por domínio, sem IP, sem cookie, sem caminho — e o middleware chama-a antes
de redirigir. Ao fim do ano a pergunta responde-se com uma consulta:

```sql
select host, sum(contagem) as visitas
  from dominio_acessos
 where dia >= current_date - 365
 group by host order by visitas desc;
```

Se o `apoios.guru` estiver perto de zero, não se renova.

O template do Magic Link não é um detalhe: o `{{ .ConfirmationURL }}` por omissão
manda as pessoas pelo `/verify` do Supabase e de volta ao fluxo PKCE, que falha
sempre em telemóvel — a webview do Gmail tem outro frasco de cookies e o
`code_verifier` não está lá. Ver o comentário em `app/auth/confirmar/route.ts`.

## Variáveis de ambiente

```
NEXT_PUBLIC_APP_URL              https://appoios.guru
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

RESEND_API_KEY                   sending_access — reencaminha
RESEND_RECEIVING_API_KEY         full_access    — lê a mensagem recebida
RESEND_INBOUND_WEBHOOK_SECRET    whsec_… do webhook
CORREIO_OPERADOR                 caixa real para onde vai o correio reencaminhado
```

As duas chaves do Resend são mesmo duas: a de envio responde `401
restricted_api_key` na API de recepção. A `RESEND_RECEIVING_API_KEY` é `full_access`
e por isso vive só na Vercel, nunca no repositório nem num log do Actions.

O `CORREIO_OPERADOR` é uma variável e não uma constante porque este repositório é
**público** — o endereço pessoal do operador em código-fonte fica ao alcance de
qualquer colector de endereços que passe pelo GitHub.

A `service_role` **nunca** vai para a Vercel — só o pipeline de recolha (GitHub
Actions, com o papel restrito `apoios_ingest`) e as funções dentro do Supabase
precisam de escrever.

## Correio de entrada

O MX de recepção está na raiz, portanto o Resend apanha correio para **qualquer**
endereço em `appoios.guru`, inventado ou não. O `app/api/correio-entrada/route.ts`
reencaminha só os aliases publicados — `contacto`, `rgpd`, `alertas`, `abuso` — e
responde 200 a tudo o resto sem reencaminhar. Sem essa lista, um endereço colhido
por um spammer chegaria a uma caixa real.

O `contacto@` não é decorativo: o `USER_AGENT` em
`packages/ingest/src/http/tipos.ts` anuncia-o a todos os sites do Estado que o
recolector lê. Um `contacto@` que devolve bounce transforma essa identificação numa
mentira, e há um teste em `lib/correio/entrada.test.ts` a prender o alias ao
User-Agent para que ninguém o tire por distração.

O `From:` do reencaminhamento fica no domínio verificado e o remetente original vai
no `reply_to`. Pôr o remetente no `From:` falharia SPF e DKIM, e o reencaminhamento
acabaria no spam.

## Ligar ao Supabase

Projecto: `mlchfviehchzoolneibo`, região **eu-west-1 (Irlanda)** — é isto que permite à
política de privacidade afirmar residência de dados na UE sem mentir.

Duas variáveis na Vercel, ambas públicas por natureza:

```
NEXT_PUBLIC_SUPABASE_URL       https://mlchfviehchzoolneibo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  (Supabase → Settings → API → anon public)
```

A chave `anon` vai para o browser de qualquer maneira; o que a torna segura é o RLS,
não o segredo. A política `apoios_publicados` é `using (publicado = true)`, por isso um
apoio não publicado **não chega sequer a sair da base de dados** — não depende de um
filtro que alguém se possa esquecer de escrever.

Com as duas variáveis ausentes, a app corre sobre os dados de exemplo e não precisa de
credencial nenhuma. Com **uma só** delas, arranca a rebentar de propósito: recorrer aos
dados de exemplo num URL de produção serviria sete apoios inventados como se fossem
reais, que é exactamente o dano que este produto existe para evitar.

A `service_role` nunca vai para a Vercel. Só o pipeline de recolha (Actions, com o papel
restrito `apoios_ingest`) e as funções dentro do Supabase escrevem.
