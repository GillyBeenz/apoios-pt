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

## 5. Por saber sobre o endpoint dos avisos do PT2030

A truncagem em cinco acabou: a fonte varre as 46 páginas e lê os 229. O que
sobra deste endpoint são duas coisas que nunca foram perguntadas.

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

`candidatosMin: 1`, e devia andar à volta de **50**.

A fonte passou a varrer as 46 páginas e a resposta real tem 229 avisos, por isso
«zero» deixou de ser o modo de falha que interessa. O varrimento falha fechado em
quase tudo — uma página que não responde não produz documento nenhum — mas há uma
falha que ele não apanha: o `paginaTemItens` passar a dizer «acabou» cedo de mais.
Aí sai um documento bem formado, com os cinco avisos da primeira página, e nada a
jusante acha estranho. É a truncagem silenciosa que este repositório já pagou
duas vezes.

**Porque não subiu já:** o `registo.test.ts` mede este piso contra a captura
committada da fonte, e essa captura é de uma página. Subir o piso agora punha a
build vermelha por causa de uma fixture velha, e commitar à mão uma fixture
varrida era saltar o `capturar-fixtures.yml` — que é por onde as fixtures deste
repositório entram, com PR e revisão.

O script de captura já varre. **O piso sobe no PR que trouxer a captura varrida**,
e esse PR é uma corrida do `capturar-fixtures.yml` mais duas linhas.
