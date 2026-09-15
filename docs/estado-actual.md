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

## 4. O ambiente não chega aos sítios do Estado

Continua a dar `403` ao CONNECT em `diariodarepublica.pt`,
`info.portaldasfinancas.gov.pt`, `sce.pt` e nos restantes. O 403 vem da
*gateway*, não dos sítios: é a política de rede do ambiente.

A lista de domínios permitidos altera-se em claude.ai/code → ícone de nuvem →
engrenagem no ambiente → **Custom** → **Allowed domains**. Ao mudar para Custom é
preciso marcar **«Also include default list of common package managers»**, senão a
lista substitui a de origem e o `pnpm install` deixa de funcionar.

**Uma sessão a correr nunca relê a configuração** — a documentação é explícita.
Mudar a política só faz efeito em sessões novas; reabrir ou retomar uma sessão
existente traz o histórico mas mantém o ambiente com que nasceu.

Enquanto isto não mudar, toda a verificação contra fontes primárias passa por
abrir um PR e esperar por um workflow.

---

## 5. Por saber sobre o endpoint do PT2030

Registado em `comum/fixtures-permanentes/pt2030-avisos-query-contrato.json`, e
repetido aqui porque é o que limita a fonte:

- **Paginação**: não foi observado nenhum parâmetro de página. A resposta trouxe
  cinco avisos. Se houver mais, vêm por um pedido que a captura não provocou.
- **`estadoAvisoId`**: o `7` é o que a página usa na vista inicial. O que valem os
  outros valores não se sabe, e é aí que devem estar os avisos encerrados.
- **Documentos**: cada aviso traz PDFs com `path` e `container`, mas **sem URL**.
  O endereço de descarga não é derivável desses dois campos, por isso
  `documentos` fica vazio — ligar a um ficheiro que não se consegue endereçar é
  pior do que não o listar.
