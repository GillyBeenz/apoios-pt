# Estado actual — nota de passagem

**Escrita a 15 de setembro de 2026.** Esta nota é para quem retoma o trabalho numa
sessão nova, e serve só para isso: os fios que ficaram por atar e que não se
descobrem a ler o código.

> **Esta nota apodrece de propósito.** Cada ponto aqui em baixo deve ser
> **apagado** quando for resolvido, não actualizado. Se algum destes itens ainda
> aqui estiver daqui a um mês, o que isso diz é que ninguém lhe pegou — e é essa
> a informação. A arquitectura, que muda devagar, está em
> `docs/como-funciona.html`; as convenções estão no `CLAUDE.md`. Nada disso
> pertence aqui.

---

## 1. `canonicalizarReferenciaLegal` mutila os códigos do PT2030

**A perda está estancada; a causa de fundo não.**

A função (em `packages/core/src/normalizar/texto.ts`) exige que o corpo da
referência comece por um dígito:

```js
const corpoMatch = t.match(/\b\d[\dA-Z]*(?:[/-][\dA-Z.]+)+\b/);
```

Certo para `AVISO N.º 03/2026`, onde o prefixo é ruído. Errado para os códigos do
Portugal 2030, onde **o prefixo é a parte que distingue**: `CENTRO2030-2026-23` e
`NORTE2030-2026-23` dão os dois `2026-23`, com força 100.

Custou um apoio: a 15/09/2026 o `CENTRO2030-2026-23` substituiu o
`NORTE2030-2026-23` — saúde, cuidados de saúde primários — que saiu do catálogo
sem deixar rasto.

### O que já foi feito (15/09/2026)

- `pt2030-avisos-listagem` deixou de usar o código como `referenciaLegal`. A
  identidade assenta no `url_canonica`, que é único porque o URL leva
  `?aviso=<codigo>`. Um teste guarda a regra, e outro verifica que dois códigos
  que canonicalizam para o mesmo continuam a dar dois apoios.
- As seis chaves `referencia_legal` mutiladas foram apagadas de
  `fund_identities`.
- As chaves do aviso do Norte que tinham ficado gravadas no apoio do Centro
  também. Sem isso a fusão repetia-se sozinha assim que o Norte voltasse —
  exactamente como este repositório já perdeu apoios antes.
- O `NORTE2030-2026-23` volta a entrar como apoio próprio na primeira corrida em
  que o endpoint o devolva. Não há nada a restaurar à mão.

### O que falta

A função continua errada para qualquer código com prefixo alfanumérico, e mais
nenhuma fonte lhe dá um hoje — mas a próxima que der volta a perder apoios.
Corrigi-la é o trabalho a sério, e tem de ser com cuidado: essa função decide a
identidade dos 450 apoios já gravados, e mudá-la muda chaves em
`fund_identities`. Tem de levar uma passagem de reparação e as chaves contadas
antes e depois.

## 2. A hora de fecho é truncada

`resposta.ts` faz `diaDe()` a `dataFim`, e `2026-10-26T18:00:00` fica
`2026-10-26` com precisão `dia`.

No último dia de candidatura, saber se fecha às 18:00 ou à meia-noite é
exactamente o que faz diferença a quem está a submeter. A precisão gravada é
honesta — diz `dia`, não mente — mas a informação existe na resposta e está a ser
deitada fora.

`DataComPrecisao` já tem precisão `minuto`, e `formatarPrazo` já a sabe mostrar.

---

## 3. Três benefícios fiscais publicados sem revisão humana

Na tabela `beneficios`, as três linhas estão agora `publicado = true` e assinadas
`Revisto por IA contra o texto legal publicado, pendente de revisão humana final`:

- Redução de IMI até 25% para prédios com eficiência energética (EBF 44.º-B)
- Isenção de IMI para prédios reabilitados (EBF 45.º)
- Obras de valorização reduzem a mais-valia tributada na venda da casa (CIRS 51.º)

A 16/09 foram lidas contra o texto legal no Portal das Finanças — o que a primeira
revisão não pôde fazer, porque o ambiente ainda não chegava lá. Nenhuma estava
errada; **as três estavam incompletas**, e em cada uma faltava precisamente a parte
accionável: o prazo de 60 dias para o requerimento ao serviço de finanças no
44.º-B; o facto de o reconhecimento no 45.º ter de ser pedido *com* o pedido de
licença, antes das obras; e, no 51.º, o n.º 2, que corta os encargos na parte
coberta por apoio público a fundo perdido — que é exactamente o caso de quem usa
este catálogo.

**Continua a faltar um humano.** Uma IA a rever o trabalho de outra IA não é
verificação independente, por mais que desta vez tenha lido a fonte primária. A
etiqueta diz isso a quem lê o site; o que falta é alguém com responsabilidade
fiscal confirmar e reassinar.

⚠️ **O IVA a 6% em painéis solares não está semeado, e é de propósito.** Expirou a
30/06/2025 e não foi reposto para 2026. É a coisa mais provável de alguém voltar
a acrescentar sem confirmar.

---

## 4. Dois apex fora da lista, e uma cadeia de certificados partida

O ponto grande — o ambiente não chegar a sítio nenhum do Estado — **está
resolvido**: a lista de domínios permitidos passou a Custom a 15/09 e os sítios
respondem. Sobram duas arestas pequenas, verificadas no mesmo dia:

- `sce.pt` e `fundoambiental.pt` **sem `www`** continuam a dar 403; só as formas
  com `www` estão na lista. Não afecta a ingestão — as três fontes usam mesmo o
  `www.` — mas apanha quem escrever um URL à mão.
- `recuperarportugal.gov.pt` passa o proxy e **falha o TLS**: «unable to get
  local issuer certificate». Não é política de rede, é a cadeia servida por eles
  que vem incompleta. O `capturar-fixtures.mjs` já trata disto sozinho, com o
  `buscarComReparo` a ir buscar o intermediário em falta — mas um `curl` ou um
  `fetch` escrito à pressa vai bater nisto e parecer um bloqueio que não é.

---

## 5. O que continua por saber do endpoint do PT2030

A paginação foi resolvida — `page`, 0-indexado, 46 páginas, 228 avisos — e o que
se aprendeu ficou no contrato da fonte e em
`comum/fixtures-permanentes/pt2030-avisos-query-paginacao.json`. Sobram duas
coisas por saber do mesmo endpoint.

- **`estadoAvisoId`**: o `7` é o que a página usa na vista inicial. O que valem os
  outros valores não se sabe, e é aí que devem estar os avisos encerrados. A sonda
  não lhes toca de propósito — uma investigação de cada vez, senão não se sabe qual
  das duas mudanças produziu a diferença.
- **Documentos**: cada aviso traz PDFs com `path` e `container`, mas **sem URL**.
  O endereço de descarga não é derivável desses dois campos, por isso
  `documentos` fica vazio — ligar a um ficheiro que não se consegue endereçar é
  pior do que não o listar.

---

## 6. O piso de saúde do `pt2030-avisos-listagem` está baixo de mais

`candidatosMin: 1`, e com o varrimento a resposta normal tem 229 apoios.

As falhas de rede já não passam despercebidas: uma página que falha é pedida
segunda vez e, se voltar a falhar, a corrida regista `erro` na saúde da fonte.
O que continua sem guarda é o caso que o próprio `paginacao.ts` assinala — uma
página vazia **a meio** trunca o varrimento, e aí sai uma corrida bem formada
com meia dúzia de apoios e nenhum erro. Um piso à volta de 50 apanhava isso: bem
acima de uma página, bem abaixo dos 229 medidos.

**Porque não subiu já:** o `registo.test.ts` mede este piso contra a captura
committada da fonte, e essa captura é de uma página — o que está certo, porque o
`lerDataset` recebe mesmo uma página de cada vez. Subir o piso punha a build
vermelha sem haver nada partido. Ou o teste passa a medir o piso de outra
maneira nas fontes paginadas, ou o piso fica onde está e a guarda vem de outro
sítio. As duas dão trabalho e nenhuma é urgente; o que não se deve é esquecer.

