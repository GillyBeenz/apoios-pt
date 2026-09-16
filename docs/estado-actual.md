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

## 1. Os códigos do PT2030 que chegam já mutilados, e uma chave por decidir

**A função está corrigida.** `canonicalizarReferenciaLegal` guarda o prefixo
regional: `CENTRO2030-2026-23` e `NORTE2030-2026-23` deixaram de colapsar em
`2026-23`. Eram **duas** avarias, não uma — além da regex do corpo, que exigia
que ele começasse por dígito, o removedor do «n.º» tinha um `[.ºO°]*` que comia
o `NO` de **NORTE**, e o código chegava ao resto da função como `RTE2030-…`.
Medido antes e depois sobre os 57 valores em bruto da base: **uma** chave muda, e
é de um apoio que não tinha chave nenhuma. Não houve nada a reparar.

Sobram duas coisas, e nenhuma é a que estava aqui escrita.

### 1a. O `pt2030-avisos` perde o prefixo antes de a função lhe tocar

A outra fonte do PT2030 — a dos artigos, com extracção por modelo — grava códigos
**já sem a região**, e por isso a correcção da função não lhe serve de nada. São
**os cinco** apoios desta fonte que têm referência; nenhum escapou:

| fundo | o que ficou gravado | o que o artigo escreve |
|---|---|---|
| `a7312041` | `2024-47` | `Centro2030-2024-47` |
| `1f614a8b` | `AVISO 2026-24` | `NORTE2030-2026-24` |
| `1d675c1a` | `2024-11` | `ACORES2030-2024-11` |
| `e0d9de1b` | `AVISO 2024-26` | `NORTE2030-2024-26` |
| `1b5ca76a` | `AVISO 2024-45` | `MAR2030-2024-45` |

**A perda de identidade está estancada.** Uma referência que seja a cauda de um
código mais longo escrito no próprio documento deixou de entrar na identidade: cai
para o `url_canonica` (70), como o #76 já tinha feito na listagem. A guarda é
determinista, corre sem rede e sem modelo, e há um teste que mostra os dois avisos
a colapsarem num só quando ela se desliga.

**Falta o resto, e são duas coisas.**

- **A causa.** O modelo continua a encurtar. A única instrução que tem para este
  campo é `Ex.: "Aviso n.º 03/C13-i01/2024"` — um exemplo só, começado por dígito,
  com a forma do Fundo Ambiental, que ensina exactamente a forma que perde o
  prefixo. Corrigir é reescrever esse `.describe()` e subir o `VERSAO_PROMPT`.
  **Não é validável offline:** não há cassetes nenhumas no repositório
  (`packages/extraction/fixtures/` nem existe), nenhum teste exercita uma extracção
  a sério, e o `chaveCassete` inclui o hash do prompt. Precisa de
  `ANTHROPIC_MODE=record` com chave, ou de uma corrida real.
- **As cinco linhas.** As chaves ambíguas continuam gravadas em `fund_identities`.
  Enquanto lá estiverem, um aviso novo que canonicalize para o mesmo número ainda
  se cola ao fundo errado — a guarda impede que se criem mais, não apaga as que
  existem. Apagá-las é uma passagem de reparação com as chaves contadas antes e
  depois, como a do #85.

### 1c. Um artigo pode anunciar seis avisos, e entra como um

Separado do prefixo, e maior. O `pagina-cedd5dbe91` anuncia `Centro2030-2024-47`
**a `-52`**; o `pagina-3229f24976` anuncia `ACORES2030-2024-11`, `-12` e `-13`. Um
artigo é um candidato, é uma extracção, é **um** `referencia_legal` — portanto seis
avisos entram como um e cinco não existem no catálogo.

Isto não é identidade, é sub-contagem, e não se resolve no mesmo sítio: ou a fonte
passa a render um candidato por aviso, ou o esquema passa a admitir vários. As duas
são mudanças de forma, não de regex.

### 1b. A listagem podia voltar a usar o código, e é uma decisão por tomar

O `pt2030-avisos-listagem` passa `referenciaLegal: null` desde o #76, para parar
a perda. Agora que a função guarda o prefixo, o impedimento desapareceu — mas
voltar a pôr o código lá muda a identidade de apoios já gravados, de uma chave de
força 70 (`url_canonica`) para uma de 100. Isso tem as suas próprias
consequências e merece as chaves contadas antes e depois, como esta teve. Não se
apanha à boleia de outra coisa.

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
