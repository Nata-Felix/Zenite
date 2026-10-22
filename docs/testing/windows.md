# Zênite — o que falta conferir (e às vezes ajustar) no Windows

Este arquivo é para um agente (Claude Code, Codex…) rodando **no Windows**. O app foi feito e
testado num Linux (Electron real, testes automáticos, capturas de tela), mas tudo abaixo depende
do Windows de verdade e **nunca foi executado lá**. Para cada item: o que é, onde está no código,
como conferir e o que fazer se estiver quebrado.

Ao terminar cada item, marque `[x]`, anote o que viu e faça commit pequeno com o porquê
(`git commit -m "Título" -m "Por quê: ..."`). Não commite `.env` nem segredos.

## 0. Preparar

```powershell
git clone https://github.com/Nata-Felix/Zenite.git zenite
cd zenite
npm install          # baixa o Electron e o node-pty do Windows (prebuilt, sem Visual Studio)
npm run typecheck
npm test             # o teste do CLI (tests/unit/terminal/cli.test.mjs) é pulado no Windows: usa socket Unix e bash
npm start            # build + abre o app
```

- [ ] `npm install` sem erro de compilação nativa (o `@lydell/node-pty-win32-x64` vem pronto).
- [x] `npm test` passa (anote quantos passaram e quais falharam, com a saída).
  - 19/10/2026: 70 passam, 1 pulado (CLI), 0 falhas, em ~18 s. Duas correções: universos (item 10)
    e `tests/unit/terminal/pty.test.mjs`, que usava `$O_TERMINAL_ID` (bash); no PowerShell é
    `$env:O_TERMINAL_ID`. Quando falhava, o PTY ficava aberto e travava o `npm test`; agora o
    teste encerra os terminais num `finally`.
- [ ] O app abre, com o título "Zênite" e o ícone na janela.

Os dados ficam em `%APPDATA%\Zenite` (ou `%APPDATA%\o`, se o usuário já usava a versão antiga com
esse nome: veja `src/main/index.ts`, procure `legacyData`).

## 1. Terminal (ConPTY) e acentos — `src/main/ptyManager.ts`, `src/main/shell.ts`

- [ ] Um terminal novo abre o PowerShell 7 (se instalado) ou o Windows PowerShell.
- [ ] Redimensionar o elemento redimensiona o terminal (sem texto quebrado).
- [ ] **Acentos**: digitar `echo "ação é você"` mostra os acentos certos, no PowerShell 7 **e**
  no 5.1. Se o 5.1 mostrar lixo, o caminho provável é acrescentar
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` no início (em `resolveShell`, como parte
  do `-Command`) ou usar `chcp 65001`. Teste também com `claude` respondendo em português.
- [ ] O usuário desta máquina tem acento no nome (**C:\Users\João Teste**). Tudo deve funcionar com isso.

## 2. Comando `zn` dos agentes — `src/main/cliInstall.ts`

O `zn.cmd` não contém caminhos (o cmd.exe lê o arquivo na página de código do console e quebraria
o "Ã"); ele usa as variáveis `O_RUNTIME` e `O_CLI`, que o app passa para cada terminal.

- [ ] Dentro de um terminal do app: `zn list` funciona no PowerShell 7, no 5.1, no cmd e no Git Bash.
- [ ] `o list` (nome antigo) também funciona.
- [ ] Fora do app (um PowerShell comum), `zn list` explica que precisa rodar dentro do Zênite.
- [ ] Com dois terminais ligados, `zn ask "Nome" "pergunta"` e `zn reply` funcionam (o teste
  automático disso só roda em Linux).

## 3. Shell padrão — Configurações → Terminal → Shell

- [ ] A lista mostra quais shells existem; "Git Bash" e "PowerShell 7" ficam desativados se não instalados.
- [ ] Trocar para **cmd** e abrir um terminal: abre o cmd. Com comando (ex.: preset `claude`),
  roda e continua aberto (`/K`).
- [ ] Trocar para **Git Bash** (caminhos em `findGitBash`): abre o bash; `zn list` funciona.

## 4. Memória e processos do terminal — `src/main/processes.ts`

Usa PowerShell/CIM para medir a memória da árvore de processos de cada terminal.

- [ ] O chip "MB" no cabeçalho do terminal mostra valores plausíveis e atualiza.
- [ ] Clicar no chip lista os processos; "Encerrar" funciona.
- [ ] Com 6+ terminais abertos, o app não fica lento por causa da medição (se ficar, aumente o
  intervalo em `src/main/index.ts`, procure `sampleProcesses`).

## 5. Avisos: selo, barra de tarefas e notificações — `src/main/index.ts` (procure `announce` e `setBadge`)

- [ ] Rodar algo longo num terminal e clicar em outro: depois de ~4 s sem saída, o primeiro ganha
  o selo "Esperando você". Olhar para ele (clicar) tira o selo.
- [ ] `zn notify "teste"` mostra o selo vermelho com a mensagem.
- [ ] **Ícone da barra de tarefas**: aparece um círculo vermelho com o número (`setOverlayIcon`).
- [ ] **Piscar** (Configurações → Notificações): com o app em segundo plano, o botão pisca e para
  ao voltar.
- [ ] **Notificação do Windows**: com o app em segundo plano, `zn notify "teste"` mostra uma
  notificação; clicar nela traz o app e vai até o terminal.
  - Com `npm start` (Electron de desenvolvimento) o Windows pode não mostrar ou mostrar como
    "Electron". O app define `app.setAppUserModelId("app.zenite")`. Confira de novo **com o app
    instalado** (item 9). Se mesmo instalado não aparecer, verifique as configurações de
    notificação do Windows para "Zênite".

## 6. Impedir a suspensão — Configurações → Geral

- [ ] Em "Enquanto os agentes trabalham", com um terminal gerando saída, rodar como admin
  `powercfg /requests`: o Zênite (ou electron.exe) aparece em **SYSTEM**. Sem saída por 2 minutos, some.
- [ ] Em "Nunca", não aparece; em "Enquanto o Zênite estiver aberto", aparece sempre.

## 7. Confirmar antes de fechar

- [ ] Com terminais abertos, fechar a janela pergunta. "Cancelar" mantém tudo rodando; "Não
  perguntar de novo" desliga (Configurações → Geral → Ao fechar).

## 8. Arquivos, pastas e seletores nativos

- [ ] "Escolher pasta" (novo terminal, galáxia, preset) abre o seletor do Windows **começando na
  pasta já digitada**.
- [ ] Arrastar um arquivo do Explorer para o canvas: imagem/vídeo viram visualizador; PDF, planilha
  etc. viram "Arquivo"; uma pasta vira "Pasta".
- [ ] Elemento Arquivo: "Abrir" usa o programa padrão; "Mostrar na pasta" abre o Explorer
  selecionando o arquivo; abrir um `.exe`/`.bat`/`.ps1` **pede confirmação**.
- [ ] Elemento Pasta: navega, abre arquivos com duplo clique, "Abrir no Explorer" funciona.

## 9. Instalador — `npm run dist:win` (configuração em `package.json`, chave `build`)

```powershell
npm run dist:win     # gera dist\Zenite-Setup-<versão>.exe (não precisa de Wine no Windows)
```

- [ ] O build termina e gera o `.exe`.
- [ ] Instalar: idioma português, escolha de pasta, atalho na área de trabalho e no menu Iniciar.
- [ ] **Ícone**: no `.exe`, no atalho, na barra de tarefas e no Alt+Tab (arquivo `build/icon.ico`).
- [ ] No app instalado, `zn list` funciona dentro de um terminal (o CLI vem de
  `resources\app.asar.unpacked\out\cli\index.js`; veja `cliScript` em `src/main/index.ts`).
- [ ] O terminal abre (o node-pty vem de `app.asar.unpacked\node_modules\@lydell\...`).
- [ ] O SmartScreen avisa "O Windows protegeu o computador": esperado, o instalador não é
  assinado. Anote; assinar exige certificado pago.
- [ ] Desinstalar mantém `%APPDATA%\Zenite` (dados do usuário).
- [ ] Atualização leve com o app instalado de verdade (pelo `Zenite-Setup`, em
  `%LOCALAPPDATA%\Programs`): a janela diz "Atualização leve, 3 MB"; ao sair, a troca acontece
  e o app abre na versão nova; `zn list` e o terminal continuam funcionando. "Apps instalados"
  do Windows ainda mostra a versão antiga (a troca leve não mexe no registro do desinstalador).

## 10. Universos (git worktree) em caminhos do Windows — `src/main/universes.ts`

- [x] Testes automáticos (`tests/unit/persistence/universes.test.mjs`) com o usuário João Teste. Falhavam 10 de 17: o
  `%TEMP%` vem com nome curto (`C:\Users\JOAOTE~1\...`) e o git devolve o longo (`C:\Users\João Teste\...`);
  o `relative` entre os dois saía com `..\` e a cópia ia para o lugar errado. Corrigido com
  `realPath` (realpathSync.native) ao comparar pastas. Esta máquina tem `core.autocrlf=true`; o
  teste agora força `false` para comparar conteúdo exato. Agora passam 17/17.

- [ ] Galáxia numa pasta com espaço e acento (ex.: `C:\Users\João Teste\Meus Projetos\Loja`):
  "Nova cópia isolada" cria a cópia, os terminais abrem nela, o `.env` vai junto.
- [ ] "Descartar cópia" com um terminal rodando dentro da cópia: o app encerra os terminais e
  apaga a pasta (o Windows segura arquivos; há novas tentativas em `removeWorktree`). Se sobrar
  pasta, anote o erro.
- [ ] "Atualizar com a Origem" com conflito: o arquivo fica com `<<<<<<<`; resolver e "Concluir"
  funciona. Atenção a finais de linha (CRLF): se o git marcar o arquivo inteiro como mudado,
  investigue `core.autocrlf`.

## 11. Skills para todos os agentes — `src/main/skills.ts`

- [ ] Configurações → Agentes: a skill `zenite` aparece instalada em `%USERPROFILE%\.claude\skills`
  e em `%USERPROFILE%\.agents\skills`.
- [ ] O **Codex** enxerga as skills de `%USERPROFILE%\.agents\skills` (abra o Codex num terminal
  e peça para listar as skills disponíveis). Se não enxergar nesta versão do Codex, o caminho
  alternativo é `%USERPROFILE%\.codex\skills` (cuidado para não duplicar).
- [ ] Uma skill que só existia em `.claude\skills` aparece em "Encontradas" e "Compartilhar com
  todos" a copia para o Codex e para as contas.

## 12. Sites no canvas — `src/renderer/components/WebNode.tsx`, `src/preload/webview.ts`

- [ ] Ctrl + rodinha dentro do site muda o zoom (o script do webview é carregado de um caminho
  que pode ter acento: `file:///C:/Users/João Teste/...`). Se não funcionar, confira o console do
  DevTools (`Ctrl+Shift+I`) por erro de preload.
- [ ] Logins em sites continuam salvos ao reabrir o app.

## 13. Teclado

- [ ] Teclado ABNT2: digitar com **AltGr** dentro do terminal (ex.: `AltGr+Q` = `/`, `AltGr+E` = `°`)
  **não** dispara atalhos do app (o app ignora teclas com AltGraph).
- [ ] `Ctrl+Tab`, `Ctrl+1…9`, `Ctrl+Shift+P`, `Ctrl+Shift+A`, `Ctrl+Alt+G` e `Ctrl+Alt+\` funcionam
  e não brigam com o Windows nem com o PowerShell.
- [ ] `Ctrl` + arrastar move terminais e sites segurando por qualquer ponto.

## 14. Aparência

- [ ] "Sistema" segue o tema claro/escuro do Windows e muda na hora.
- [ ] Fontes do terminal: Cascadia Mono/Code e Consolas aparecem; as não instaladas caem na próxima.
- [ ] "Tamanho da interface" (90–125%) fica nítido em tela com escala 125%/150% do Windows.

## Não feito (decisão: para depois)

- Restaurar as sessões dos agentes ao reabrir o app.
- ~~Atualizações automáticas~~: feito (`src/main/updater.ts`, electron-updater). O app procura
  versão nova nos Releases do repositório público `Nata-Felix/Zenite`, baixa em segundo
  plano e instala ao sair (ou em "Reiniciar agora"). Falta publicar a primeira versão com o workflow (`.github/workflows/release-win.yml`).
- WSL, SSH e Docker como ambientes de terminal.
- Pull requests do GitHub/GitLab pela CLI `gh`/`glab`.
- Controle remoto pelo celular e licença: fora do escopo.
