# Apoios

Alertas de apoios ambientais e energéticos para proprietários de casa em Portugal.

Monitoriza as fontes públicas portuguesas (Fundo Ambiental, PT2030, PRR, ADENE/DGEG),
extrai cada aviso para dados estruturados, acompanha o seu ciclo de vida, e envia um
email quando abre — ou está prestes a fechar — financiamento a que a pessoa se pode
mesmo candidatar, para as melhorias que escolheu seguir.

> **Estado:** Fase 1 em curso. O pipeline de recolha, a extração e o modelo de dados
> estão construídos e testados. A aplicação web e o envio de emails ainda não.

## Duas decisões que explicam quase tudo o resto

**A elegibilidade falha fechada.** Muitos programas portugueses excluem pessoas
singulares — o E-Lar destina-se apenas a municípios, IPSS e associações de moradores.
Alertar um proprietário para um apoio a que não se pode candidatar custa-lhe uma tarde
e custa-nos a credibilidade, por isso `admite_particulares` é um triestado e
`desconhecido` bloqueia o alerta tal como `nao`. O apoio aparece no catálogo com o
aviso "elegibilidade por confirmar" e uma ligação à fonte oficial, mas não gera email.

**A informação errada faz mal a sério.** Um prazo falhado, ou uma bomba de calor de
dez mil euros comprada na expectativa de um apoio inexistente, são danos reais. Por
isso cada campo decisivo traz uma citação literal do documento, essa citação é
verificada por código contra o texto original, e uma extração que não passa não envia
email nenhum.

## Estrutura

```
packages/core         tipos, taxonomia, normalizadores pt-PT, identidade,
                      diferenças, varrimento temporal, correspondência
packages/extraction   camada Claude: esquema, prompt em cache, verificação de
                      provas, portão de confiança
packages/ingest       HTTP com pedidos condicionais, adaptadores de fonte,
                      orquestrador do pipeline, saúde das fontes
supabase/migrations   esquema, RLS, papel restrito de ingestão, pg_cron
```

## Desenvolvimento

```bash
pnpm install
pnpm typecheck
pnpm test          # corre sem qualquer acesso à rede
pnpm ingerir --list
```

### Porque é que tudo corre offline

O ambiente de desenvolvimento não consegue aceder a nenhum domínio do Estado
português — `fundoambiental.pt`, `portugal2030.pt`, `diariodarepublica.pt` e os
restantes estão bloqueados pelo proxy de saída. Os runners do GitHub Actions não
estão, por isso:

- cada extractor é uma função pura `extrair(html, ctx)`, testada contra fixtures
  commitadas;
- `capturar-fixtures.yml` vai buscar as páginas reais no Actions e abre um PR com
  elas;
- a extração corre contra cassetes gravadas, e uma cassete em falta é um erro
  ruidoso — nunca uma chamada silenciosa (e paga) à API.

**Até esse workflow correr, os selectores em `fundo-ambiental-aac/extract.ts` estão
escritos contra markup adivinhado.** São defensivos de propósito e o piso de saúde
(`candidatosMin`) impede que um palpite errado falhe em silêncio, mas o passo seguinte
é correr a captura e afinar os selectores contra o HTML verdadeiro.

## Custo

Um aviso típico de 20 páginas custa cerca de $0,20 a extrair. A três a cinco documentos
alterados por dia, são cerca de **$30/mês**. Re-extrair tudo diariamente seriam cerca
de $600 — por isso os dois portões de mudança no pipeline não são uma optimização, são
o modelo de custo. O primeiro salta a fonte inteira quando nada mexeu; o segundo salta
avisos individuais, e é o maior dos dois, porque uma listagem muda sempre que *um* dos
seus quarenta itens muda.

O `__VIEWSTATE` do ASP.NET é removido antes de calcular o hash. Sem isso, todas as
recolhas pareceriam diferentes e nenhum dos portões fecharia alguma vez.
