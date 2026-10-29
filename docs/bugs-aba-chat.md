# Bugs da aba Chat (teste de 29/10/2026)

Teste ao vivo no Zênite de desenvolvimento (commit `93834a9`), com Claude Code, Codex e Antigravity
lado a lado. Três rodadas de mensagens pedindo formatações diferentes, mais perguntas interativas,
comandos `/`, anexo de imagem e menus da tela. As respostas foram enviadas pelo mesmo caminho do
chat (`composer.send` / `composer.choose`) e conferidas por captura de tela e pelo HTML gerado.

Arquivos principais: `src/renderer/components/ChatView.tsx`, `ChatView.css`,
`src/main/chatTranscript.ts`, `src/main/agentControl.ts` (`parseMenu`), `src/renderer/markdown.ts`.

## Alta: atrapalham o uso

Os cinco foram corrigidos e conferidos ao vivo:
- **1:** o campo sobe quando a barra está por cima e continua clicável.
- **2:** a pergunta assíncrona do Codex fica aberta e é respondida com uma mensagem.
- **3:** um cartão só, com "Outra resposta…".
- **4:** a régua sai da opção.
- **5:** a tabela rola para o lado.

Os blocos de código e as tabelas também ganharam botão de copiar, e cada resposta ganhou "Copiar resposta".

### 1. A barra de opções do card cobre o campo de mensagem — corrigido
- **Onde:** card aberto e selecionado (visão focada). A barra "Editar · Reload · Sol · Constelação…"
  fica por cima do campo "Envie uma mensagem…".
- **Prova:** `document.elementFromPoint` no centro, na esquerda e na direita do campo devolve
  `.node-options-caption`, não o `textarea`. Clicar no campo não dá foco; só dá para digitar
  focando por código.
- **Correção sugerida:** no modo Chat, subir a barra para cima do card (ou para fora dele), ou
  reservar espaço embaixo do chat quando a barra está visível.

### 2. Pergunta do Codex aparece como já respondida — corrigido
- **Onde:** Codex, ferramenta `request_user_input_async`.
- **O que acontece:** a chamada é assíncrona; o Codex grava o `function_call_output` na hora e não
  abre menu na tela. O chat marca a pergunta como respondida (cinza, botões desligados) sem a
  pessoa ter escolhido nada.
- **Correção sugerida:** para `request_user_input*`, não marcar como respondida pelo output; marcar
  quando chegar a próxima mensagem da pessoa. O clique na opção deve **enviar o texto** da opção
  (`composer.send`), porque não há menu para `composer.choose`.

### 3. A mesma pergunta aparece duas vezes — corrigido
- **Onde:** Claude (`AskUserQuestion`) e Antigravity (`ask_question`).
- **O que acontece:** aparece o cartão da pergunta (lido do arquivo) e logo abaixo
  "Esperando sua escolha no terminal" com as mesmas opções (lidas da tela).
- **Correção sugerida:** se a última pergunta do arquivo está pendente e há menu na tela, mostrar um
  cartão só: texto da pergunta do arquivo, botões do menu da tela. As opções extras do CLI
  ("Type something", "Chat about this", "Write-in…") viram "Outra resposta", que foca o campo.

### 4. Opção de menu com lixo de régua — corrigido
- **Onde:** menu do `AskUserQuestion` do Claude.
- **O que acontece:** a opção 4 vem como `4. Type something. ────────…` e o botão fica enorme, com a
  régua dentro.
- **Correção sugerida:** no `parseMenu`, tirar caracteres de desenho de caixa (`─━═│`) do texto da
  opção.

### 5. Tabela larga quebra palavras no meio — corrigido
- **Onde:** os três agentes, tabela de 8 colunas.
- **O que acontece:** "Rec / urso", "Identificaçã / o", "Ren / deri / zaçã / o". A tabela encolhe
  em vez de rolar para o lado.
- **Causa:** `.chat-markdown { overflow-wrap: anywhere }` vale também dentro das células.
- **Correção sugerida:** em `th, td`, usar `overflow-wrap: normal; word-break: normal` e uma largura
  mínima (ex.: `min-width: 9ch`). A tabela já tem `display: block; overflow-x: auto` e passa a rolar.

## Média: visual e acabamento

Os oito foram corrigidos e conferidos ao vivo:
- **6:** miniatura da imagem no balão.
- **7:** botão Cancelar (Esc) nos menus.
- **8:** sem o zoom no modo Chat.
- **9:** cena do tema só no topo.
- **10:** tema escolhido no astro do cabeçalho.
- **11:** checklist só com a caixa.
- **12:** selo "Recomendado".
- **13:** o chat limpa a seleção ao abrir.

Apareceu um caso novo no teste: o cancelamento gravado pelo Claude ("[Request interrupted…]") aparecia como mensagem sua. Agora vira a nota "Interrompido".

### 6. Imagem enviada aparece como "[Image #2]" — corrigido
- **O que acontece:** o balão mostra `[Image #2]Descreva esta imagem…` e embaixo só "1 imagem", sem
  miniatura. O Claude recebeu e descreveu a imagem certo; o problema é só a exibição.
- **Correção sugerida:** tirar `[Image #N]` do texto (Claude e Codex) e mostrar a miniatura. O
  Claude grava a imagem em base64 no arquivo; para os outros, guardar o caminho enviado pelo chat.

### 7. Não dá para cancelar um menu pelo chat — corrigido
- **O que acontece:** `/model` abre o menu de modelos, que aparece como botões, mas não há como sair
  sem escolher (no terminal seria Esc).
- **Correção sugerida:** botão "Cancelar" no cartão "Esperando sua escolha", enviando `\x1b`
  (`window.o.pty.write`).

### 8. Cabeçalho apertado: chip sobreposto — corrigido
- **Onde:** Codex (tem o chip de uso "5h 5% · sem 17%").
- **O que acontece:** o chip "Esperando você" fica cortado e encoberto pelo controle de zoom.
- **Correção sugerida:** esconder o zoom no modo Chat (ele só muda a letra do terminal) e deixar os
  chips encolherem com reticências.

### 9. A decoração do tema atravessa o conteúdo — corrigido
- **Saturno:** a linha de órbita cruza o chat de ponta a ponta, passando por cima do texto, das
  tabelas e das perguntas.
- **Sol:** o anel do sol passa por trás dos balões, tabelas e blocos de código, mais visível em
  cards altos.
- **Correção sugerida:** limitar a cena ao topo (uns 140 px) com `mask-image` em degradê, como o
  horizonte do Netuno já faz.

### 10. O botão de tema flutua por cima do conteúdo — corrigido
- **O que acontece:** o astro no canto superior direito cobre o canto do balão do usuário e dos
  títulos ao rolar.
- **Correção sugerida:** levar o botão para o cabeçalho, ao lado das abas, ou reservar uma margem
  à direita no topo.

### 11. Checklist com marcador duplo — corrigido
- **O que acontece:** cada item mostra o ponto da lista e a caixa de seleção.
- **Correção sugerida:** `li:has(> input[type="checkbox"]) { list-style: none }` e menos recuo na
  lista.

### 12. Opção "(Recommended)" crua no Antigravity — corrigido
- **O que acontece:** o botão mostra "(Recommended) Azul".
- **Correção sugerida:** tirar o prefixo e mostrar um selo "Recomendado" no botão.

### 13. Duplo clique para abrir o card seleciona todo o texto do chat — corrigido
- **O que aconteceu:** na visão resumida, o duplo clique na bolinha abriu o card e o texto inteiro
  do chat ficou selecionado (azul). **Confirmar** com mouse de verdade: no teste o clique foi
  sintético.

## Baixa: formatos ainda não suportados — corrigidos

Todos conferidos ao vivo numa resposta do Claude com todos os formatos juntos.

| # | Formato | Como ficou |
|---|---|---|
| 14 | Nota de rodapé `[^1]` | número sobrescrito no texto e lista numerada no fim |
| 15 | Fórmula `$…$` e `$$…$$` | desenhada pelo KaTeX; "R$ 10" continua texto |
| 16 | Bloco ```mermaid | diagrama desenhado (mermaid em modo strict); o botão de copiar copia o código |
| 17 | Imagem externa | link "Ver imagem: logo (example.com)" que abre no navegador |
| 18 | Blocos de código | realce de sintaxe (highlight.js); diff com linhas verdes e vermelhas |
| 19 | Caminho `C:…arquivo.ts:42` | link que abre o arquivo (pede confirmação se for programa) |
| 20 | Opções numeradas | os botões ganham o título "Responder com um clique" |
| 21 | Opção clicada | envia a opção inteira ("B. Simplificar os blocos") |
| 22 | Lista de `/` | lê a lista real do CLI na primeira vez que se digita "/" (com o agente parado), junto com a fixa |

As bibliotecas novas são katex 0.19.0, mermaid 12.2.0 e highlight.js 11.12.0, com versões fixas.
Cada uma é carregada só quando a resposta precisa dela; o pacote principal da interface quase não
mudou.

Apareceram dois casos no teste, também corrigidos:
- **Opções de mentira:** uma lista numerada comum virava botões só porque a resposta terminava com
  uma pergunta. Agora, depois das opções, só podem vir até 3 linhas (a pergunta ou uma instrução).
- **"/" esquecido no terminal:** ao ler a lista de "/" do Claude, sobrava um "/" no campo do
  terminal. O `listCommands` não reconhecia o prompt "❯".

## O que funcionou

- **Markdown básico nos três:** títulos, negrito, itálico, riscado, código inline, listas de 2 e 3
  níveis (misturando números e marcadores), citações aninhadas em 3 níveis, linha horizontal,
  tabela simples, links, URL solta, emojis, `<kbd>` e `<details>`.
- **Blocos de código:** linha de 200 caracteres rola para o lado, sem estourar o card.
- **Botões de opção:** opções 1–4 e A–C viram botões nos três agentes, e clicar envia a resposta.
- **Perguntas interativas:** respondidas pelo chat no Claude e no Antigravity; o agente confirmou a
  cor escolhida.
- **Menus da tela:** permissão do Antigravity (4 opções, inclusive a que quebra linha), "confiar na
  pasta" e `/model` do Claude aparecem como botões.
- **Comando `/`:** "/" lista os comandos, "/m" filtra para `/model`.
- **Anexo:** imagem enviada pelo caminho do chat chegou ao Claude e foi descrita.
- **Leitura ao vivo:** ações e "trabalhando" aparecem durante a resposta.

## Não é bug

- A bandeira 🇧🇷 aparece como "BR": o Windows não desenha bandeiras em emoji.
- Depois de reiniciar o Zênite, o chat do Claude começa vazio: o processo novo abre uma sessão nova.

## Não testado

- Tema claro do app, Grok (não instalado), terminal isolado (Docker), dois Codex ou dois
  Antigravity na mesma pasta, conversa muito longa (desempenho da leitura e da rolagem).
