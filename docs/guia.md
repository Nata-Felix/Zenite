# Guia completo do Zênite

Referência detalhada de recursos, dados, atalhos, comando `zn` e desenvolvimento.
Para a visão geral do produto, veja o [README](../README.md).

Canvas infinito para terminais e agentes de IA (Claude Code, Codex, etc.), feito para Windows.

## Organização do repositório

| Pasta | Conteúdo |
|---|---|
| `src/main`, `src/preload`, `src/renderer`, `src/shared` | Aplicativo Electron, ponte segura, interface e contratos compartilhados. |
| [`tests/`](../tests/README.md) | Catálogo, testes por área, cenários Electron, Docker, CLIs locais e fixtures. |
| [`scripts/`](../scripts/README.md) | Ferramentas de build, isolamento, assets e verificação de publicação. |
| [`docs/`](README.md) | Documentação técnica, roteiros de validação e estudos visuais. |
| `build/`, `installer-ui/` | Recursos de distribuição e código do instalador Windows. |
| `out/`, `dist/` | Saídas locais geradas; ignoradas pelo Git. |

Para validar o código: `npm run typecheck`, `npm test` e `npm run build`.
O [catálogo de testes](../tests/README.md) explica as suítes que exigem interface gráfica,
Docker ou contas locais. `npm run security:check` verifica arquivos que não devem ser publicados;
consulte também a [política de segurança](../SECURITY.md).

## Recursos em detalhe

- **Organizar automaticamente**: botão **Organizar** no dock distribui terminais e elementos
  da esquerda para a direita, seguindo as conexões. Separa grupos independentes, coloca
  elementos sem ligação em grade e respeita o tamanho das janelas, inclusive em fluxos com
  ciclos. Com vários elementos selecionados, **Automático** na barra de seleção organiza só
  aquele trecho, evitando os outros elementos. `Ctrl+Alt+O` organiza a seleção (ou o canvas
  inteiro quando não há pelo menos dois elementos selecionados). O botão de desfazer ao lado
  de Organizar restaura as posições e o enquadramento anteriores. Desenhos ficam no lugar.
- **Selecionar, copiar, recortar e colar no canvas**: `Ctrl+A` seleciona tudo, inclusive desenhos;
  `Ctrl+C`/`Ctrl+V` criam cópias independentes com o sufixo **- cópia**; `Ctrl+X` recorta para mover
  com `Ctrl+V` neste canvas, em outro universo ou em outra galáxia. O recorte remove todas as
  conexões, preserva nome, aparência e conteúdo, e mantém a sessão do terminal rodando.
  A cópia de vários elementos leva apenas as conexões internas da seleção. Notas, tabelas e
  mídia são duplicadas; elementos Arquivo/Pasta continuam apontando para o mesmo caminho no
  disco. O recorte fica guardado mesmo ao reabrir o app, com **Desfazer recorte** para devolvê-lo
  à origem; copiar/recortar outra seleção também devolve o recorte anterior. Dentro de terminais,
  campos de texto e sites, os atalhos continuam pertencendo ao conteúdo. Os quatro atalhos
  aparecem em Configurações → Atalhos e na busca rápida.
- **Painel do terminal selecionado**: um clique abre **Editar** (nome, cor, fonte, tamanho e
  tema só daquele terminal), **Reload** (encerra a sessão atual e executa novamente o comando
  inicial), **Constelação** (lista das conexões diretas, com botão para ir ao elemento) e
  **Linhas**. Em Linhas, a prévia acompanha o mouse: clique em qualquer parte do destino para
  conectar, ou escolha-o na lista; `Esc` cancela. Outros elementos também têm Constelação e
  Linhas. Desenhos não participam das conexões.
- **Canvas como editor**: arrastar no vazio seleciona várias janelas (basta tocar); Espaço +
  arrastar (ou o botão do meio) move a tela. Del ou X removem, sempre com confirmação. Contorno
  mais grosso na janela selecionada e borda de 12 px para redimensionar.
- **OpenRouter e Grok CLI no "+ Novo"**: OpenRouter abre o Claude Code apontado para a OpenRouter
  (chave criptografada pelo Windows em `<pasta de dados>\segredos`, modelo em Configurações →
  Agentes); Grok CLI roda o comando `grok`.
- **Desempenho**: terminal em WebGL, sem `backdrop-filter`, medição de memória por um PowerShell
  que fica aberto, sites não roubam o mouse durante arrastes.

- **Instalador e atualização automática**: `Zenite-Setup-<versão>.exe` instala ou atualiza por
  cima. O app instalado procura versão nova nos Releases de `Nata-Felix/Zenite`, baixa
  em segundo plano e instala ao sair, ou na hora com "Reiniciar agora". Em Configurações → Sobre,
  "Procurar atualização". Para publicar: veja [Publicar uma versão](#publicar-uma-versão).
- **Atualização leve**: se a versão nova usa o mesmo Electron da instalada, o app baixa só os
  arquivos dele (`app-<versão>.tar.gz`, ~5 MB, com `resources/app.asar` e
  `resources/app.asar.unpacked`) em vez do instalador (~113 MB). Ao sair, um processo auxiliar
  espera o Zênite fechar, troca os arquivos com cópia de segurança (`resources\.zenite-old`) e,
  em "Reiniciar agora", reabre o app. Se o Electron mudou, se a pasta de instalação não aceita
  escrita, se o sha512 não confere ou se a troca falhar, usa o instalador completo. A janela de
  atualização diz qual dos dois e o tamanho. Registro em `<pasta de dados>\app-update\updater.log`.

- **Backups** (Configurações → Dados): automático ao abrir, a cada 6 horas e ao fechar; "Fazer
  backup agora"; restaurar com um clique (o estado atual é guardado antes, dá para desfazer).
  Guarda galáxias, canvases, notas e tabelas; ficam os 30 mais recentes. Também mostra o espaço
  usado por parte e abre a pasta de dados.
- **Sobre**: versão, código-fonte e "Relatar um problema" (issue no GitHub).

- **Configurações**:
  - A janela pode ser movida pelo cabeçalho e permanece dentro da tela.
  - *Geral*: abertura de links, energia e confirmação ao fechar.
  - *Personalização*: tema, cor principal (6 prontas ou personalizada pelo espectro/hexadecimal), tamanho da interface,
    fundo do canvas, linhas e 13 animações vetoriais de ligação (SVG), tamanho e aparência dos itens novos,
    fonte, cores e cursor dos terminais. Atalhos internos levam diretamente a cada grupo visual.
  - *Canvas*: mouse, zoom, foco ao passar o mouse e tamanho da tela usada para renderizar os cartões.
  - *Terminal*: histórico, shell padrão e **presets seus** (aparecem no "Novo terminal" e no dock).
  - *Agentes*: permissões, skills, provedores e regras de trabalho.
  - *Notificações*: avisos dos agentes e indicadores na barra de tarefas.
  - *Atalhos*: todos com busca, e dá para trocar as teclas (avisa conflito). `Ctrl` + letra não
    dispara dentro do terminal.
- Nota com cor própria (bolinha no cabeçalho).

- **Organizar a seleção**: com 2 ou mais elementos selecionados (`Ctrl` + clique, ou `Shift` +
  arrastar uma caixa) aparece uma barra para alinhar, distribuir, organizar em grade
  (`Ctrl+Alt+G`) e enquadrar a seleção (`Ctrl+Alt+\`).

- **Busca rápida** (`Ctrl+Shift+P`, ou `Ctrl+P` fora do terminal): terminais e elementos de todas as
  galáxias e universos, galáxias e comandos (novo terminal, nova nota, tema, configurações…).
- **Importar/exportar galáxias**: passe o mouse sobre uma galáxia na barra lateral e clique
  em **Exportar galáxia**; **Importar galáxia** fica no rodapé da barra lateral. Ambos também
  aparecem na busca rápida. O pacote `.zenite-galaxia` preserva Origem, universos, elementos,
  conexões e agrupamentos. Escolha separadamente conteúdos (notas, tabelas, arquivos, pastas,
  skills e projeto), mídia e `.env`/`.env.*`. O `.env` começa desmarcado tanto ao exportar quanto
  ao importar e pode levar senhas/tokens; o pacote não é criptografado. Arquivos de contas,
  sessões de login, dependências e histórico Git não são transportados.
  A importação cria uma galáxia nova, com pastas próprias, e mantém a atual aberta. Universos
  chegam como pastas separadas sem branches Git; agendamentos chegam pausados. Sem conteúdos
  ou mídia, os elementos permanecem vazios para preencher depois. Salve o pacote fora da pasta
  do projeto. Pastas importadas ficam em `galaxias-importadas/` dentro dos dados do Zênite.
- **Teclado**: `Ctrl+Tab` / `Ctrl+Shift+Tab` percorrem os elementos; `Ctrl+1`…`9` vão ao terminal N.
- **Nota em Markdown**: botão de olho no cabeçalho alterna entre formatado e edição (duplo clique
  volta a editar). O HTML é limpo antes de mostrar, e links abrem no navegador.

- **Skills para todos os agentes** (Configurações → Agentes): uma biblioteca do Zênite copia cada
  skill para o Claude Code (`~/.claude/skills` e a pasta de cada conta) e para `~/.agents/skills`,
  lida pelo Codex (todas as contas), Gemini e outros. Agentes sem suporte a skills recebem a lista
  no guia (`AGENTS.md`/`CLAUDE.md`). Skills que só um agente via aparecem em "Encontradas" para
  compartilhar. Skills suas com o mesmo nome nunca são substituídas.
- **Skills como elementos**: adicione uma pasta com `SKILL.md` pelo botão de livro no dock,
  ligue aos agentes e leia com `zn skill read "Nome"`. Os arquivos permanecem na pasta escolhida,
  sem instalação global. `--resource references/guia.md` lê arquivos de apoio dentro da pasta;
  atalhos que escapam dela são recusados. As instruções não ampliam permissões.
- **Serviços como elementos**: o botão de plugue cria uma API HTTP/webhook ou um MCP por
  Streamable HTTP (revisões 2025). Configure o endereço e, se necessário, o **nome** da variável
  do token no `.env` da galáxia; o conector envia Bearer e não guarda o valor no canvas.
  `zn service test|tools "Nome"`, `zn service request "Nome" GET caminho` e
  `zn service call "Nome" "ferramenta" --file argumentos.json` usam o serviço ligado.
  Enviar dados exige habilitar operações; MCP também exige autorizar o nome da ferramenta.
  Sempre perguntar confirma cada operação; Sandbox bloqueia a rede deste conector; controle
  total dispensa confirmação. Até o Sol precisa de ligação direta. Satélites e Torres recebem
  uma sessão temporária limitada às integrações ligadas, respeitando suas próprias permissões.
  Serviços remotos exigem HTTPS. Esta versão não inicia servidores MCP por stdio, nem faz
  login OAuth; Postgres, Docker, SSH e outros podem ser usados por um servidor MCP HTTP
  configurado pelo usuário. A pasta da skill e o `.env` não são incluídos na exportação.
- **Supervisão**: selo "Esperando você" quando um terminal trabalhou e ficou quieto, `zn notify`
  para o agente pedir atenção, contador no título/galáxia/barra de tarefas, notificação do Windows,
  `Ctrl+Shift+A` para ir ao próximo. Impedir a suspensão e confirmar antes de fechar.

- **Fundo do canvas** em Configurações: pontos, grade, cruzes ou liso, com espaçamento pequeno,
  médio ou grande. Muda na hora e vale para todas as galáxias.

- **Desenho no canvas, no estilo Excalidraw**: retângulo, elipse, losango, seta, linha, lápis
  e texto, com cor do traço e do fundo, hachura, espessura, traço contínuo/tracejado/pontilhado,
  aparência limpa ou rabiscada, fonte (manuscrita, normal, serifa, código), tamanho,
  alinhamento, opacidade, camadas, duplicar, desfazer e refazer. Desenhos são decoração sua:
  **agentes não os veem** e eles não se ligam a terminais.

- **Git como memória do projeto, embutido**: o app exige git, ajuda a ativá-lo (com
  `.gitignore` seguro e primeiro commit), e ensina os agentes a buscar no histórico em vez de
  reler arquivos. Agentes commitam com `zn commit` (título + porquê + pendente + agente) e
  veem tudo com `zn history`. Por galáxia: commits **automáticos** ou **só sugerir**.

- **Editor de variáveis (.env)** em lista chave/valor, com valores escondidos, aviso e
  correção do `.gitignore`, preservando comentários. Um `.env` por Origem e por universo.
- **Universos recebem uma cópia do `.env`** (e outros arquivos fora do git, configuráveis
  por galáxia) — dá para usar porta/banco diferentes em cada universo.
- **Memória por terminal** no cabeçalho, com a lista de processos e botão para encerrar.

- **Contas separadas**: cada terminal Claude Code ou Codex pode usar uma conta própria
  (login separado), e todos continuam conversando pelo canvas.

- **Universos paralelos**: cópias isoladas do projeto (git worktree numa branch própria),
  cada uma com seu canvas. Agentes de um universo não mexem nos arquivos da Origem; quando
  terminar, "Fazer merge na Origem". Em conflito, nada muda na Origem.
- **Tema claro e escuro** (segue o sistema por padrão; seletor no rodapé da barra lateral).
- Vocabulário: galáxia = projeto, Origem = pasta principal, universo = cópia isolada.
  Os botões dizem a ação literal (criar cópia, fazer merge, descartar).

- **Notas, imagens, vídeos e sites no canvas** (botões no dock, ou arraste arquivos/links
  para a janela). Agentes usam o que estiver **ligado** a eles: ler/editar notas, abrir
  imagens como referência, controlar sites.

- **Agentes conversam pelas ligações**: cada terminal tem o comando `zn` (veja abaixo).
  Só terminais ligados no canvas se enxergam.

- **Visual novo**: barra lateral recolhível (vira um trilho com as iniciais dos workspaces),
  dock flutuante com atalhos de agente e zoom, cor por agente nos terminais, indicador
  de processo vivo e ligações com um pulso animado.
- **Duplo clique no canvas** cria um terminal naquele ponto.

- **Workspaces**: barra lateral com vários projetos, cada um com sua pasta e seu canvas.
  Trocar de workspace não encerra os terminais — eles seguem rodando em segundo plano
  e a saída reaparece quando você volta.
- Terminais reais (PowerShell) dentro de nós no canvas.
- Criar terminal com atalhos: Shell, Claude Code, Codex, ou comando próprio.
- Arrastar pela barra do título, redimensionar (selecione o nó e puxe os cantos), zoom e pan.
- Ligar nós entre si por **Linhas** ou pelas bolinhas laterais. As conexões dão acesso nos dois sentidos.
- Layout e ligações salvos automaticamente e restaurados ao reabrir.

## Universos paralelos (galáxia, Origem, universo)

| Termo | O que é |
|---|---|
| Galáxia | Um projeto (a pasta configurada na barra lateral) |
| Origem | A pasta original do projeto |
| Universo | Cópia do projeto numa branch `universo/<nome>`, em `%APPDATA%\Zenite\universos\` |

- **Nova cópia isolada**: cria o universo a partir do último commit da Origem (alterações não
  commitadas não vão junto). Pode copiar o canvas da Origem; terminais passam a abrir na cópia.
- **Fazer merge na Origem**: commita o que estiver pendente (você escreve a mensagem) e faz
  `git merge --no-ff` na Origem. Em conflito, o merge é desfeito e os arquivos são listados.
- **Atualizar com a Origem**: traz para o universo os commits novos da Origem (o número no
  botão diz quantos). A Origem não muda. Em conflito, a atualização **fica parada no universo**:
  o diálogo lista os arquivos, explica os marcadores `<<<<<<<`/`>>>>>>>`, copia um pedido pronto
  para um agente resolver e só conclui quando não sobra marcador. **Cancelar atualização** volta
  o universo a como estava. Enquanto houver conflito, o merge na Origem fica bloqueado.
- **Descartar cópia**: encerra os terminais do universo e apaga a cópia e a branch.
- Galáxia sem pasta, ou pasta sem git: o diálogo de nova cópia diz isso e leva a escolher a pasta
  e ativar o git. Ainda dá para criar **só canvas, sem merge** (marcado como "só canvas" na barra).
- No novo terminal, o ícone de pasta abre o seletor do Windows. Numa galáxia sem pasta, a pasta
  escolhida pode virar a pasta do projeto (é ela que os universos copiam).
- `zn list` mostra em que galáxia/universo/branch o agente está.

## Git como memória

- **Sem git instalado**: aviso no topo com o comando `winget install --id Git.Git -e`.
- **Pasta sem git**: botão **Ativar git** — cria o repositório e um `.gitignore` que deixa de fora
  `.env` e `node_modules`, mostra os arquivos antes do primeiro commit e pede nome/e-mail se o git
  ainda não souber.
- **`zn commit "Título" --why "porquê" [--todo "pendente"]`**: commita tudo da pasta do agente com a
  mensagem padrão abaixo e **recusa** `.env` que não esteja no `.gitignore`.

  ```
  Título

  Por quê: ...

  Pendente: ...

  Agente: <nome do terminal>
  ```
- **`zn history [--grep TEXTO] [--file CAMINHO] [-n N]`**: últimos commits de todas as branches
  (Origem e universos) e quantos arquivos estão sem commit em cada lugar.
- **Commits dos agentes** (Editar galáxia): *Automático* ou *Só sugerir*. No modo sugerir, o
  `zn commit` vira uma proposta que aparece na barra da galáxia; você edita e commita por ali, ou
  commita do seu jeito e descarta. Seus commits manuais nunca são alterados (o Zênite não instala hooks).
- **Guia para os agentes** (Configurações, ligado por padrão): escreve um bloco marcado com as
  regras de git no `~/.claude/CLAUDE.md`, no `~/.codex/AGENTS.md` e nas pastas das contas. O resto
  dos arquivos não é tocado; desligar remove o bloco.

## Variáveis (.env)

Botão **Variáveis (.env)** na barra da galáxia: edita o `.env` da pasta do canvas aberto
(Origem = pasta da galáxia; universo = cópia do universo). Chaves viram MAIÚSCULAS com `_`,
valores ficam escondidos até clicar no olho, comentários do arquivo são mantidos. Se o git
não ignora o `.env`, aparece um aviso com o botão "Adicionar ao .gitignore".

Ao criar um universo, arquivos fora do git que batem com os padrões da galáxia (padrão:
`.env`, `.env.*`, `**/.env`, `**/.env.*`) são copiados para a cópia. `node_modules` não vai:
rode a instalação dentro do universo. Os padrões ficam em "Editar galáxia".

## Memória e processos

Cada terminal mostra a memória somada do shell e de tudo que rodou nele. Clique para ver
os processos e encerrar um deles (o shell só fecha pelo ×). Atualiza a cada 4 s.

## Contas

No diálogo de novo terminal (Claude Code ou Codex), escolha a **Conta**: "Padrão" usa o
login que já existe no seu PC; "+ Nova conta…" cria uma conta com pasta própria em
`%APPDATA%\Zenite\contas\`. Na primeira vez, faça o login dentro do terminal (`/login` no Claude).

- Claude Code recebe `CLAUDE_CONFIG_DIR` e Codex recebe `CODEX_HOME` apontando para a pasta da conta.
- A conta nova começa vazia (sem suas configurações, MCPs e skills do `~/.claude`); o Zênite instala
  nela a skill do comando `zn`.
- `CLAUDE_CONFIG_DIR` é amplamente usado, mas não aparece na documentação oficial da Anthropic:
  pode mudar em versões futuras do Claude Code.
- Confira os termos de uso de cada serviço antes de usar várias contas.

## Regra de acesso

Um terminal só **usa** e só **vê** o que está ligado a ele por uma linha. O `zn list` não
mostra o resto do canvas, e o `zn` recusa ler, editar ou interagir com um elemento sem ligação.
Exceção: o Sol alcança o canvas dele e os universos da mesma galáxia. Arquivos e pastas que o
Sol cria precisam ficar dentro da pasta da galáxia ou de um universo dela. Fora disso, o Zênite
pergunta (Permitir/Recusar); com **Lembrar**, a outra galáxia fica liberada para o Sol desta, e a
liberação aparece em **Editar galáxia**, onde dá para revogar.

Limite honesto: um agente com acesso ao terminal consegue ler arquivos do disco por conta
própria. A regra é garantida para tudo que passa pelo `zn`, e a skill instrui o agente a
respeitá-la, mas não é um cofre contra um agente tentando burlá-la.

## Elementos

| Elemento | No canvas | Agente ligado pode |
|---|---|---|
| Nota | Texto editável | `zn note read/write/append`, `zn note create` (nova nota já ligada) |
| Imagem / Vídeo | Arquivo copiado para o app | `zn media "Nome"` (caminho do arquivo), `zn media set "Nome" arquivo` |
| Site | Navegador com barra de endereço; logins ficam salvos; zoom da página com Ctrl + rodinha ou − / + | `zn web snapshot/click/type/key/navigate/eval/screenshot`, `zn web create URL` |
| Arquivo | **Qualquer arquivo** (PDF, planilha, código, zip…). Fica onde está, não é copiado; mostra tipo, tamanho, data e prévia de texto; abre no programa padrão | `zn file "Nome"` (caminho), `zn file create CAMINHO` |
| Pasta | Explorador em miniatura: entra nas subpastas, duplo clique abre, arrastar um item põe ele no canvas | `zn folder "Nome"` (caminho e conteúdo) |
| Tabela | Grade editável; linha 1 é o cabeçalho; Enter desce | `zn table read/write/set`, `zn table create` |

Arrastar do Windows para o canvas: imagem e vídeo viram visualizador (cópia no app); qualquer outro
arquivo vira **Arquivo** e uma pasta vira **Pasta**, apontando para o original.

Sites só podem ser controlados com o workspace deles aberto na tela.

**Desenhos** (barra da direita) não são elementos: não aparecem em `zn list`, não se ligam a
terminais e vão junto quando um universo copia o layout da Origem.

## Como os agentes conversam (comando `zn`)

Dentro de qualquer terminal do Zênite (o nome antigo, `o`, continua funcionando):

| Comando | O que faz |
|---|---|
| `zn list` | Mostra quem é este terminal, quem está ligado a ele e pedidos esperando resposta |
| `zn ask "Nome" "mensagem"` | Cola a mensagem no outro terminal e **espera** a resposta (até 10 min; `--timeout`). Com `--no-wait`, entrega e libera quem perguntou |
| `zn reply N "resposta"` | Responde ao pedido #N recebido. Se quem perguntou ainda espera, vira a saída do `zn ask`; se não (`--no-wait`, tempo esgotado ou comando cortado), chega como mensagem nova no terminal dele |
| `zn check "Nome"` | Mostra a tela atual do outro terminal, em texto |
| `zn send "Nome" "texto"` | Digita teclas cruas (`\n` Enter, `\e` Esc, `\x03` Ctrl-C), para menus |

Quem recebe vê algo como:

```
[Zênite · pedido #3 de "Arquiteto"]
Pode revisar o login?

Quando terminar, responda executando: zn reply 3 "sua resposta"
```

**Claude Code** aprende o comando sozinho: ao abrir, o Zênite instala a skill
`~/.claude/skills/o-canvas/SKILL.md` (só se a pasta `~/.claude` existir; nunca sobrescreve
um arquivo que não seja do Zênite). **Codex e outros** entendem os pedidos recebidos pelo próprio
texto da mensagem; para eles *iniciarem* uma conversa, diga algo como "rode `zn help` e
pergunte ao Revisor...".

Textos longos ou com aspas/símbolos: use `-` e mande pela entrada padrão, ou `--file caminho`.
No PowerShell/cmd isso evita problemas de aspas.

Por baixo: o app abre um servidor HTTP num named pipe (`\\.\pipe\o-...`, um por execução).
Cada terminal recebe `O_PIPE`, `O_TERMINAL_ID` e um `O_TOKEN` secreto próprio; o servidor
confere o token e só deixa falar com quem está ligado no canvas.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+T` | Novo terminal |
| `Ctrl+Shift+B` | Recolher/expandir a barra lateral |
| Duplo clique no fundo | Novo terminal ali |
| `Alt` + arrastar | Move qualquer elemento segurando por qualquer ponto (terminal, site, nota…) |
| `Ctrl+A` | Selecionar todo o canvas (fora de terminais e campos de texto) |
| `Ctrl+C` / `Ctrl+V` | Copiar e colar a seleção; cópias recebem o sufixo "- cópia" |
| `Ctrl+X` / `Ctrl+V` | Recortar e mover a seleção, inclusive entre universos e galáxias; remove as conexões |
| `Ctrl+Alt+O` | Organizar automaticamente a seleção, ou todo o canvas |
| `Ctrl+Shift+P` (ou `Ctrl+P` fora do terminal) | Busca rápida |
| `Ctrl+Shift+A` | Ir ao próximo terminal que precisa de você |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Próximo / anterior elemento |
| `Ctrl+1` … `Ctrl+9` | Ir ao terminal 1…9 (ordem de leitura do canvas) |
| `Esc` | Fecha diálogos; volta para a seleção |
| `V` `R` `O` `D` `A` `L` `P` `T` | Selecionar, retângulo, elipse, losango, seta, linha, lápis, texto |
| `Shift` arrastando | Forma quadrada/redonda; linha em ângulos de 45° |
| `Ctrl+Z` / `Ctrl+Y` | Desfazer / refazer desenhos |
| `Ctrl+D` / `Delete` | Duplicar / excluir desenhos selecionados |
| Duplo clique num texto | Editar o texto |

Os atalhos de desenho só valem fora de terminais, notas e campos de texto.

## Como rodar no Windows

Pré-requisito: [Node.js](https://nodejs.org) 22 ou mais novo.

```powershell
cd caminho\para\o
npm install
npm start
```

`npm install` baixa o Electron e o terminal nativo para Windows (não precisa de Visual Studio).
Se o PowerShell 7 (`pwsh`) estiver instalado, ele é usado; senão, o Windows PowerShell.

## Publicar uma versão

Suba a versão em `package.json`. `npm run dist:win` gera em `dist/` tudo que vai no Release
`v<versão>` de `Nata-Felix/Zenite` (ou envie uma tag `v*` e o workflow
`.github/workflows/release-win.yml` publica os cinco):

| Arquivo | Para quê |
|---|---|
| `Zenite-Setup-<versão>.exe` | instalador completo (primeira instalação e quando o Electron muda) |
| `Zenite-Setup-<versão>.exe.blockmap` | o electron-updater baixar só os blocos do instalador que mudaram |
| `latest.yml` | o app descobrir que há versão nova |
| `app-<versão>.tar.gz` | atualização leve (só os arquivos do app) |
| `app-update.json` | versão, Electron, sha512 e tamanho do pacote leve |

Sem os dois últimos o app usa o instalador completo, então suba-os junto (antes ou junto do
`latest.yml`). Para testar sem GitHub: `ZENITE_UPDATE_FEED=http://127.0.0.1:8080/` faz o app
procurar a versão nova nesse endereço (uma pasta com os arquivos acima) e `ZENITE_DATA_DIR`
separa a pasta de dados. Com `ZENITE_UPDATE_FEED` o instalador completo fica desligado: ele
instalaria por cima do Zênite de verdade (vai para a pasta registrada no Windows), não da cópia
em teste.

## Onde ficam os dados

Quem já usava o app quando ele se chamava O continua em `%APPDATA%\o\` (as cópias dos universos
guardam esse caminho); instalações novas usam `%APPDATA%\Zenite\`.

Notas em `%APPDATA%\Zenite\notes\`, imagens e vídeos em `%APPDATA%\Zenite\media\`.
Em `%APPDATA%\Zenite\workspaces\`: `index.json` (lista de workspaces e o último aberto) e um
`<id>.json` por workspace com o canvas. O `canvas.json` da v0.1 é migrado automaticamente
para o workspace "Principal".

## Estrutura

| Pasta | Papel |
|---|---|
| `src/main` | Processo principal do Electron: PTYs (`ptyManager.ts`), shell (`shell.ts`), workspaces e canvas (`workspaceStore.ts`), servidor do CLI (`controlServer.ts`) |
| `src/cli` | O comando `zn` usado pelos agentes |
| `src/main/elements.ts`, `webDriver.ts` | Notas, mídia e controle dos sites |
| `src/main/universes.ts` | Universos paralelos (git worktree, merge, descarte) |
| `src/main/accounts.ts` | Contas: pasta e variável de ambiente por conta |
| `src/main/envFile.ts`, `processes.ts` | Editor de .env; memória e processos por terminal |
| `src/main/gitSetup.ts`, `gitMemory.ts`, `agentGuide.ts` | Ativar git, `zn commit`/`zn history`, guia dos agentes |
| `src/renderer/vocab.ts`, `theme.ts` | Termos da interface e tema claro/escuro |
| `src/preload` | Ponte segura entre a janela e o processo principal |
| `src/renderer` | Interface: canvas (React Flow) e terminais (xterm.js) |
| `src/shared` | Tipos usados pelos dois lados |
| `scripts` | Testes (`npm test`) |

## Comandos

### Buraco negro

No menu **Astros**, escolha **Buraco negro** e use **Escolher elementos** para guardar
terminais, notas, sites e outros elementos. Arraste um elemento ou uma seleção feita com
**V** sobre o ícone: a porta se ilumina e guarda os elementos ao soltar. Também é possível
usar **Guardar seleção em Buraco negro** na barra da seleção.

Clique no ícone para abrir a pasta no canvas com zoom. **Voltar ao canvas** ou **Esc**
recolhe a pasta e restaura a visão anterior, sem encerrar os aplicativos. As linhas externas
passam pela porta tanto aberta quanto recolhida; os IDs, as conexões reais e as permissões dos agentes permanecem
iguais. Mover o Buraco negro desloca seus membros. **Desagrupar** remove apenas o agrupador,
e Ctrl+Z restaura o grupo. Funciona também na visão compacta, ao copiar/colar e ao
exportar/importar o canvas. Um elemento pertence a um grupo por vez; grupos não se aninham.

### Desenvolvimento

- `npm start` — compila e abre o app
- `npm test` — testa terminais (PTY real), workspaces, elementos e o CLI `zn` ponta a ponta
- `npm run typecheck` — checa os tipos
- `npm run test:galaxy-archive` — abre o Zênite com dados descartáveis para verificar exportação,
  importação, universos, conteúdos, mídia e inclusão explícita do .env.
- `npm run test:black-holes` — compila e valida o agrupador numa janela visível do Zênite,
  com perfil descartável. Capturas e resultado em `out/black-hole-qa/`.
- `npm run test:integrations` — abre uma janela real do Zênite com dados descartáveis e testa
  criação, configuração, ligações, skills, HTTP, MCP, permissões e persistência. Só usa serviços
  locais; o seletor de pasta e as respostas de confirmação são simulados pelo teste.
- `npm run test:ui` — confere painel, edição, Reload, conexões, atalhos, transferências,
  segurança e integrações com dados separados. Os cenários do Sol, de segurança e de
  integrações abrem janelas visíveis; as capturas ficam nas pastas de teste dentro de `out/`.

## Licença

Apache-2.0.
