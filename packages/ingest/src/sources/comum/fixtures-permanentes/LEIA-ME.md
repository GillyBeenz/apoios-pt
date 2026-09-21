# Fixtures permanentes

Capturas guardadas à mão, que o `capturar-fixtures.yml` **não** apaga.

O script de captura faz `rm -rf` ao directório `fixtures/` de cada fonte antes de
escrever, para que uma fixture obsoleta nunca fique a fingir que é actual. O efeito
secundário é que uma captura só consegue guardar aquilo que o sítio serve **hoje**.

`erro-aspx-200.html` é o caso que isso destrói. É a página de erro real do
fundoambiental.pt — servida com **HTTP 200**, 433 bytes, hash perfeitamente estável.
Foi capturada quando um URL de entrada estava errado; assim que o URL foi corrigido,
o sítio deixou de a servir e a captura seguinte apagou-a.

Mas é exactamente ela que prova que o `ehPaginaDeErro` funciona — e sem esse detector
uma fonte morta parece saudável para sempre, porque nem o código de estado nem o hash
mudam. Perder a fixture seria perder a única prova do salvaguarda mais valioso do
pipeline, precisamente por o bug que o motivou ter sido corrigido.

`prr-pagina-20182-vazia.json` é a resposta REST do WordPress para a página de
candidaturas do PRR. Guardada porque prova uma ausência: `content.rendered` tem
zero bytes e `acf` é uma lista vazia. A página não tem conteúdo nenhum no CMS — a
listagem inteira é montada no browser.

Sem isto, a tentação de voltar a tentar o endpoint volta de cada vez que alguém
olha para a fonte e vê que ela não produz nada.

## Os dois ficheiros `-pedidos-de-dados.json`

Provam outra ausência, e uma presença.

Quando uma página é montada no browser, a pergunta seguinte é sempre a mesma: *de
onde é que ela vai buscar os dados?* A captura de 14/09/2026 correu as duas páginas
num Chromium e registou todos os pedidos `xhr` e `fetch` que elas fizeram. O que
sobra depois de tirar a analítica está aqui.

`prr-candidaturas-pedidos-de-dados.json` tem **um** pedido, e é telemetria. A página
do PRR não vai buscar avisos a lado nenhum — com browser trouxe 1568 caracteres
visíveis contra 1514 sem ele, e a diferença é o aviso de cookies. Não há rota
escondida para encontrar. É isso que este ficheiro fecha.

`pt2030-avisos-pedidos-de-dados.json` tem o contrário: `POST
https://portugal2030.pt/wp-json/avisos/query` devolve os avisos em JSON. A página
renderizada também os mostra, mas custa 3 MB numa linha só para 4417 caracteres
úteis. O endpoint é a rota certa, e este ficheiro é onde ela ficou registada antes
de alguém a implementar.

## `pt2030-avisos-query-contrato.json` e `...-resposta.json`

O passo seguinte àquele ficheiro de pedidos: não só *que* endpoint a página chama,
mas **o que lhe manda e o que recebe de volta**.

Saber que existe um `POST /wp-json/avisos/query` não chega para lá bater. Falta o
corpo — que é `application/x-www-form-urlencoded` com `estadoAvisoId`, vinte e três
`programaId[]` e dois campos de ordenação — e falta a forma da resposta. Nenhuma das
duas coisas se adivinha de fora, e tentar adivinhar custa uma ronda de tentativa e
erro contra um servidor que não é nosso.

O `-contrato.json` tem o pedido tal como a página o enviou, em bruto e descodificado,
com as três coisas que ainda não se sabem escritas como notas: o que valem os outros
`estadoAvisoId`, e se há paginação (esta resposta trouxe cinco avisos e nenhum
parâmetro de página foi observado).

O `-resposta.json` é a resposta inteira, real, de 14/09/2026. Serve de fixture ao
extractor: é contra ela que ele é escrito e testado, sem rede.

## `pt2030-avisos-query-paginacao.json`

A nota do contrato dizia que não se tinha observado paginação nenhuma. A 15/09/2026
isso deixou de ser uma curiosidade e passou a ser uma perda: os dois avisos mais
antigos por data de publicação saíram da resposta no dia em que dois novos entraram,
e um deles — o `NORTE2030-2026-22` — tem prazo até 31/12/2026, por isso não pode ter
saído por ter encerrado.

Este ficheiro é o que o servidor respondeu quando lhe perguntámos. `sondar-paginacao.yml`
corre `scripts/sondar-paginacao-pt2030.mjs`, que manda o corpo real da fonte com um
parâmetro acrescentado de cada vez — `page`, `limit`, `offset` e mais uns quantos
nomes de três convenções diferentes — e regista o que voltou.

**Só aparece depois de o workflow correr**, e é `workflow_dispatch`: isto é uma
investigação com um fim, não uma tarefa semanal contra um servidor que não é nosso.

Duas coisas a ler antes do resto:

- **`base.estavel`.** A base é pedida no princípio e no fim. Se o PT2030 publicar um
  aviso a meio da sonda, todas as variantes seguintes parecem reconhecidas — uma
  pista falsa que custaria a sessão seguinte inteira.
- **`controlo_positivo.passou`.** Inverter `order_by_direction` tem de mudar a
  resposta, porque é o único parâmetro que se sabe que o endpoint lê. Se não mudar,
  a sonda não consegue detectar um parâmetro que funcione — e aí um resultado todo
  `ignorado` não prova ausência de paginação nenhuma, prova só que a sonda está
  partida. Sem este controlo, a conclusão errada mais cara desta investigação era
  indistinguível da certa.

Um nome que não foi experimentado continua por experimentar. O ficheiro leva a lista
completa dos que foram, precisamente para que a próxima pessoa não repita os mesmos.

## `pt2030-aviso-lisboa2030-2023-12-alteracao.pdf`

188 KB de PDF a sério, e o único ficheiro binário aqui. É a alteração de julho de
2025 ao `LISBOA2030-2023-12`, descarregada a 21/09/2026 pela rota
`/wp-json/avisos/download`. Foi escolhido por ser o mais pequeno dos avisos medidos,
não por ser especial: qualquer um dos outros servia.

Está aqui porque o leitor de PDFs não se consegue testar sem um. Um PDF fabricado à
mão prova a gramática dos operadores — e o `pdf.test.ts` fabrica sete —, mas não
prova a única coisa que interessava saber: que o leitor aguenta o que o Estado
publica de facto. O leitor anterior passaria em todos os testes fabricados em que
se pensasse, porque o que ele não sabia fazer era descomprimir, e um exemplo
fabricado só tem streams comprimidos se quem o fabricou se lembrar disso.

O que este ficheiro guarda, em concreto:

- **Streams `FlateDecode`.** Todo o texto do documento está comprimido, que é o
  caso normal e era o caso que o leitor anterior não via.
- **O dicionário `Info` dentro de um object stream.** A data de produção
  (`ModDate`) não está em texto claro em lado nenhum do ficheiro. Uma primeira
  medição deste repositório procurou-a só nos bytes crus e concluiu que 67
  documentos não tinham data nenhuma. Tinham todos.
- **Texto partido por célula de tabela.** O código do aviso sai
  `LISBOA2030 - 2023 - 1 2`, porque o produtor posicionou cada pedaço com o seu
  próprio `Tm`. O leitor não junta isso, e não deve fingir que junta: uma citação
  do modelo que contenha o código não é verificável contra este documento, e o
  campo cai para `baixa`. É uma limitação medida, não um descuido.

Não é apagado pelo `capturar-fixtures.yml` pela mesma razão que os outros: o sítio
serve o que serve hoje, e este ficheiro é uma prova de como os avisos eram feitos.

## `pt2030-download-blob-inexistente-200.xml`

215 bytes, e a mesma armadilha do `erro-aspx-200.html` noutro sítio: um erro
servido com **HTTP 200**.

A listagem do PT2030 anuncia o `Aviso_Competências qualificações ad. local
(IT)_Rep_março2025.pdf` no `NORTE2030-2024-80`. O blob não existe, e o Azure
responde 200 com este XML:

```xml
<Error><Code>BlobNotFound</Code><Message>The specified blob does not exist.
```

Três tentativas seguidas a 21/09/2026 deram os três a mesma coisa, com
`RequestId` diferente. Não é intermitência: o índice aponta para um ficheiro que
já lá não está.

É um de 570 documentos do tipo «Aviso» medidos nos 127 avisos multi-documento —
raro, e exactamente por isso é que vale a pena estar guardado. Se o PT2030
repuser o ficheiro amanhã, a prova desaparece, e a fase de detalhe fica sem o
caso contra o qual se escrever.

O que ele obriga a lembrar: **o tipo declarado não chega para decidir o que se
descarregou.** Dos 673 documentos do tipo «Aviso» na listagem, 670 são `.pdf`,
dois são `.docx` e um é um `.xlsx` — o `DOC4_Modelo_Mapa_orçamental.xlsx` do
`CENTRO2030-2026-16`, um mapa orçamental arquivado como se fosse o aviso. Quem
buscar o detalhe tem de olhar para os bytes, não para o rótulo nem para o código
de estado.
