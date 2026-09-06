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

## Variáveis de ambiente

Nenhuma é necessária hoje. Quando o Supabase existir:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

A `service_role` **nunca** vai para a Vercel — só o pipeline de recolha (GitHub
Actions, com o papel restrito `apoios_ingest`) e as funções dentro do Supabase
precisam de escrever.

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
