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

## 3. Três benefícios fiscais à espera de revisão humana

Na tabela `beneficios`, três linhas com `publicado = false` e
`verificado_por = 'IA - Modelo LLM claude-opus-5'`:

- Redução de IMI até 25% para prédios com eficiência energética
- Isenção de IMI para prédios reabilitados
- Obras de valorização reduzem a mais-valia tributada na venda da casa

A primeira revisão foi feita por um modelo e está assinada como tal. **Uma IA a
verificar-se a si própria não é verificação independente**, e isto é matéria
fiscal: alguém tem de ler os três e pôr `publicado = true` nos que aprovar.

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

## 5. A fonte dos avisos abertos lê cinco de 228

**Isto já não é uma dúvida de contrato: é perda activa, e está medida.**

A 14/09 o endpoint devolveu cinco avisos; a 15/09 devolveu cinco outros. Os dois
que desapareceram — `NORTE2030-2026-22` e `NORTE2030-2026-23` — são exactamente
os dois mais antigos por data de publicação, e entraram pelo topo dois publicados
a 15/09. O `NORTE2030-2026-22` tem prazo até **31/12/2026**: não saiu por ter
encerrado.

O pedido leva `order_by_field=publicacao&order_by_direction=desc`. O que a fonte
devolve não são «os avisos abertos», são os **cinco abertos publicados mais
recentemente** — e cada aviso novo empurra um antigo para fora do catálogo sem
deixar rasto. É a pergunta que o produto existe para responder, truncada em cinco.

Isto também responde à outra metade do mistério da sessão anterior: o
`NORTE2030-2026-23` não voltou depois da limpeza das chaves porque deixou de vir
na resposta, não porque a limpeza tenha falhado. A limpeza estava certa. O aviso
está vivo e volta sozinho assim que a fonte pedir a segunda página.

### O contrato, já observado

A sonda (`scripts/sondar-paginacao-pt2030.mjs`) correu a 15/09 e o endpoint
respondeu. Dos 20 nomes experimentados só **um** foi reconhecido:

- **O parâmetro é `page`**, e é **0-indexado**. `page=0` devolve byte a byte o
  mesmo que o pedido sem `page` nenhum; a segunda página é `page=1`. Isto não é
  um detalhe: ler o `page` como 1-indexado salta a segunda página inteira, e foi
  assim que se chegou a concluir, por engano, que dois avisos tinham desaparecido
  do conjunto quando estavam na página que não foi pedida.
- **46 páginas**, de `page=0` a `page=45`, cinco por página e três na última.
- **228 avisos** no `estadoAvisoId=7`, todos distintos, zero duplicados. A fonte
  tem estado a ingerir **cinco**.
- **O fim da paginação não é um erro HTTP**: `page=46` devolve `200` com
  `{code: 404, info: "No data found"}` no corpo. O envelope continua a ser
  `{avisos, status}` e **não traz total** — quem varre tem de andar até ao
  sentinela.
- Ignorados: `paged`, `pagina`, `page_number`, `pageIndex`, `numeroPagina`,
  `limit`, `per_page`, `perPage`, `posts_per_page`, `pageSize`, `page_size`,
  `length`, `rows`, `take`, `numeroRegistos`, `offset`, `skip`, `start`, `inicio`.

Os dois `NORTE2030-2026-22` e `-23` estão vivos em `page=1`, nas duas primeiras
posições. Foram empurrados das posições 4 e 5 para as 6 e 7, tal como a teoria
previa — não saíram do conjunto. Voltam ao catálogo no dia em que a fonte pedir
a segunda página.

### O que falta

**Implementar a paginação**, e a decisão de desenho que estava por confirmar
confirmou-se na pior das duas hipóteses: o parâmetro é de *página* e não de
*limite*, por isso varrer quer dizer **46 POSTs ao mesmo URL**. O livro de
snapshots é indexado por URL, e 46 pedidos a partilhar um sobrescrevem o portão
da mudança uns dos outros e ficam todos a parecer permanentemente mudados. Está
escrito no comentário de `pedidosEntrada`, em `tipos.ts`.

Isto não se resolve com uma linha e é matéria para quem decide a arquitectura:
o portão da mudança tem de passar a ter uma chave que distinga páginas do mesmo
URL, ou a fonte tem de deixar de usar `pedidosEntrada` para isto.

### O que continua por saber do mesmo endpoint

- **`estadoAvisoId`**: o `7` é o que a página usa na vista inicial. O que valem os
  outros valores não se sabe, e é aí que devem estar os avisos encerrados. A sonda
  não lhes toca de propósito — uma investigação de cada vez, senão não se sabe qual
  das duas mudanças produziu a diferença.
- **Documentos**: cada aviso traz PDFs com `path` e `container`, mas **sem URL**.
  O endereço de descarga não é derivável desses dois campos, por isso
  `documentos` fica vazio — ligar a um ficheiro que não se consegue endereçar é
  pior do que não o listar.
