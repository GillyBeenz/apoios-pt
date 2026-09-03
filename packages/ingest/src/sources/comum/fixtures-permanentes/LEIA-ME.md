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
