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

## 1. Perda de dados activa: códigos do PT2030 colidem na chave mais forte

**Isto é o mais importante da nota, e é um defeito introduzido a 14/09/2026 com a
fonte `pt2030-avisos-listagem`.**

`canonicalizarReferenciaLegal` (em `packages/core/src/normalizar/texto.ts`) exige
que o corpo da referência **comece por um dígito**:

```js
const corpoMatch = t.match(/\b\d[\dA-Z]*(?:[/-][\dA-Z.]+)+\b/);
```

Está certo para as referências para que foi escrita — em `AVISO N.º 03/2026` o
prefixo é ruído e deve mesmo ser deitado fora. Está errado para os códigos do
Portugal 2030, onde **o prefixo é a parte que distingue**:

| Código | Chave que produz |
| --- | --- |
| `CENTRO2030-2026-23` | `2026-23` |
| `NORTE2030-2026-23` | `2026-23` |

O `2030` de `CENTRO2030` não está numa fronteira de palavra, por isso a captura
só começa em `2026`. Os dois códigos dão a mesma chave, com **força 100** — a
mais forte que existe, a que `resolverIdentidade` respeita acima de todas.

**O que isso já custou.** A 14/09 o catálogo tinha
`NORTE2030-2026-23 — Saúde, cuidados de saúde primários`. A 15/09 chegou o
`CENTRO2030-2026-23`, bateu na mesma chave, e o pipeline tratou-os como o mesmo
apoio. O aviso do Norte **já não está no catálogo**. Não foi duplicado: foi
substituído.

A prova está nas chaves da fonte: sete `titulo_norm` distintos e sete
`url_canonica` distintos, contra **seis** `referencia_legal` e seis apoios. Sete
avisos vistos, um perdido.

### Porque é que nada avisou

O alerta de conflitos de identidade (migração 0017) **não apanha isto**, e é
importante perceber porquê antes de confiar nele: ele regista quando duas chaves
apontam para apoios *diferentes* e o apoio não é gravado. Aqui não houve
conflito nenhum do ponto de vista do código — as chaves concordaram. O sistema
fez exactamente o que lhe foi pedido, com uma chave errada.

### Duas saídas, e a escolha não é óbvia

**A — não usar `codigoAviso` como `referenciaLegal` nesta fonte.**
Em `packages/ingest/src/sources/pt2030-avisos-listagem/paraApoio.ts`, pôr
`referenciaLegal: null`. A identidade passa a assentar no `url_canonica`, que é
único porque o URL leva `?aviso=<codigo>`. Pára a perda imediatamente, não toca
em nada partilhado. Custo: perde-se a fusão entre fontes — o mesmo aviso visto
pelo `pt2030-avisos` e pela API deixa de se reconhecer.

**B — corrigir o `canonicalizarReferenciaLegal` para preservar o prefixo.**
Mais correcto no geral, e provavelmente o que está certo a prazo. Mas essa
função decide a identidade dos **450 apoios** do catálogo, e mudá-la muda chaves
que já estão gravadas em `fund_identities`. Há precedente nesta base de dados de
uma correcção de identidade feita a meio ter deixado chaves erradas escritas nas
sobreviventes, que depois repetiam a fusão a cada corrida. Se for por aqui, tem
de ser com uma passagem de reparação e com as chaves antigas contadas antes e
depois.

**Recomendação:** A agora, para parar a perda; B a seguir, com calma e com
medição. A próxima corrida é às 05:30 UTC.

### Recuperar o que se perdeu

O `NORTE2030-2026-23` volta sozinho se ainda estiver na resposta do endpoint na
próxima corrida depois de a chave ser corrigida. Se já não estiver (o prazo era
31/12/2026, por isso deve estar), fica perdido — não há cópia do que tinha.

---

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
