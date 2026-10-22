# Roteiro de testes: Ctrl+Z do canvas e Sol completo

Feito em 21/10/2026 para testar, item a item, o que entrou nos commits `bb14224` (Ctrl+Z),
`29ffd39` (Sol completo), `96adec1` (o resto do Sol) e no commit seguinte (o Sol comandando os CLIs
dos outros terminais, copiar entre canvases e selos guardados).

**Como usar (para o agente que vai testar):** faça os itens na ordem. Em cada um, rode o que está
em **Faça**, confira o que está em **Espere** e marque `[x]` quando passar. Se falhar, não corrija
nada ainda: anote embaixo do item `FALHOU:` com o comando, a saída e o que esperava, e siga para o
próximo. Itens marcados **(usuário)** precisam de mouse/teclado no app: peça ao usuário e anote o
que ele disser. No fim, faça um commit só com este arquivo marcado
(`zn commit "Resultado dos testes do Sol" --why "..."`).

Atalhos: `zn canvas` mostra o canvas inteiro (confira por ele quase tudo). Nomes com espaço vão
entre aspas. Onde aparece `#id`, use o id curto que o `zn canvas` mostra.

---

## 0. Preparação

- [x] **0.1 Testes automáticos.** Faça: na pasta do Zênite (`C:\projeto`), `npm run typecheck`, `npm test`
  e `npm run test:ui`. Espere: typecheck sem erro; `npm test` com `fail 0`; `test:ui` termina com
  sete linhas `{"ok":true...}` (as linhas "No handler registered for 'tasks:get'" são normais).
  Resultado em 21/10: tipos aprovados; 197 testes, 196 aprovados, 0 falhas e 1 pulado por ser exclusivo
  de Linux; as sete verificações de interface passaram em perfis descartáveis.
- [x] **0.1b Teste ao vivo com os CLIs.** Faça: `npm run test:live -- --agy-account <id de uma conta do
  Antigravity com login, pasta em %APPDATA%\o\contas>`. Espere: termina com `{"ok":true}`. Ele abre um
  Codex e um Antigravity de verdade, sem mandar pedidos ao modelo (sem a conta, pula o Antigravity).
  Resultado em 21/10: Codex e Antigravity autenticados passaram, incluindo mudança de esforço e menus.
  A ferramenta de execução herdava `TERM=dumb`; repetir com `TERM=xterm-256color` resolveu a abertura.
- [ ] **0.2 App aberto (usuário).** Rode `npm start`. Crie uma galáxia **"Teste Sol"** apontando para
  uma pasta nova com git e um commit (ex.: `C:\teste-sol`, com `git init` e um `README.md` commitado).
- [ ] **0.3 O Sol (usuário).** Nessa galáxia, crie um terminal Codex chamado **"Sol"**, clique nele
  e em "Promover a Sol". Crie também uma nota **"Plano"** e um terminal Shell **"Comum"** (sem ligar
  a nada). Os itens abaixo são rodados **dentro do terminal Sol** (o Codex roda os comandos `zn`).
- [ ] **0.4 Papel.** Faça: `zn list`. Espere: as linhas "Papel: você é o Sol..." e "Você também mexe
  no canvas inteiro: zn canvas...".

## 1. Ctrl+Z do canvas (usuário)

Cada item: faça a ação com o mouse, clique no vazio do canvas, aperte **Ctrl+Z** e depois **Ctrl+Y**.

- [ ] **1.1 Mover.** Arraste a nota "Plano". Ctrl+Z volta ao lugar; Ctrl+Y move de novo.
- [ ] **1.2 Redimensionar.** Mude o tamanho de um terminal pelo canto. Ctrl+Z volta o tamanho.
- [ ] **1.3 Ligar e desligar.** Ligue "Plano" ao "Comum". Ctrl+Z tira a linha. Ligue de novo, desligue
  pelo menu (Desvincular): Ctrl+Z traz a linha.
- [ ] **1.4 Renomear.** Renomeie "Plano" para "Plano 2" pelo título. Ctrl+Z volta para "Plano".
- [ ] **1.5 Cor da nota.** Troque a cor da nota. Ctrl+Z volta a cor.
- [ ] **1.6 Configurar astro.** Crie um astro Órbita, mude "voltas" para 5 e salve. Ctrl+Z volta para 3.
- [ ] **1.7 Criar.** Crie uma nota nova. Ctrl+Z tira a nota.
- [ ] **1.8 Apagar nota com texto.** Escreva "texto de teste" numa nota e apague a nota (X → Remover).
  O aviso diz "Ctrl+Z traz de volta". Ctrl+Z traz a nota **com o texto**.
- [ ] **1.9 Apagar tabela.** Crie uma tabela, escreva numa célula, apague. Ctrl+Z traz com o conteúdo.
- [ ] **1.10 Apagar imagem.** Arraste uma imagem para o canvas, apague, Ctrl+Z: a imagem aparece.
- [ ] **1.11 Organizar.** Clique em "Organizar". Ctrl+Z volta todas as posições.
- [ ] **1.12 Fechar terminal.** Feche o "Comum" (X → Remover). Ctrl+Z traz o nó de volta com um shell
  novo (a tela antiga some). Ctrl+Y **não** fecha o terminal.
- [ ] **1.13 Desenhos continuam.** Desenhe um retângulo, mude a cor, Ctrl+Z, Ctrl+Z: volta a cor e
  depois some o retângulo.
- [ ] **1.14 Dentro do terminal.** Clique dentro de um terminal e aperte Ctrl+Z: vai para o terminal,
  o canvas não muda.

## 2. Ver o canvas

- [ ] **2.1** Faça: `zn canvas`. Espere: linhas com `"Sol" [terminal]`, `"Plano" [nota]`,
  `"Comum" [terminal]`, cada uma com `#id`, posição e tamanho; seções "Desenhos" e "Ligações" se houver.
- [ ] **2.2** Faça: `zn canvas --json`. Espere: JSON com `nodes`, `edges` e `tasks`.
- [ ] **2.3** Faça: `zn canvas show "Plano"`. Espere: JSON com `node` (kind `note`) e `links`.
- [ ] **2.4** Faça: `zn canvas show "Ninguém"`. Espere: erro "não existe neste canvas".
- [ ] **2.5 Quem não é Sol.** No terminal "Comum", rode `zn canvas`. Espere: erro "Só o Sol mexe no canvas inteiro".

## 3. Elementos

- [ ] **3.1** `zn node create nota "Ideias" --near "Plano" --side abaixo --text "primeira ideia"`.
  Espere: "Criado: nota "Ideias""; na tela, a nota abaixo do Plano com o texto; aviso "☀ Sol criou..." no topo.
- [ ] **3.2** `zn node create nota "Ideias"`. Espere: cria "Ideias 2" (nome não repete), ao lado do Sol sem cobrir ninguém.
- [ ] **3.3** No PowerShell: ``zn node create tabela "Preços" --text "Plano;Preço`nBásico;10"`` (o `` `n `` é a
  quebra de linha; ou use `--file preco.csv`). Espere: tabela com 2 colunas e a linha "Básico | 10".
- [ ] **3.4** `zn node create site "Exemplo" --url https://example.com`. Espere: site aberto no canvas.
- [ ] **3.5** `zn node create site "Sem url"`. Espere: erro "Site precisa de --url".
- [ ] **3.6** `zn node create arquivo "Leia" --path C:\teste-sol\README.md`. Espere: elemento arquivo.
- [ ] **3.7** `zn node create pasta "Projeto" --path C:\teste-sol`. Espere: elemento pasta listando os arquivos.
- [ ] **3.8** `zn node create imagem "Logo" --path <um .png do disco>`. Espere: imagem aparece.
  `zn node create imagem "X" --path C:\teste-sol\README.md`: erro "precisa ser imagem".
- [ ] **3.9** `zn node move "Ideias" 2000,200`, depois `zn node move "Ideias" --by 0,300`, depois
  `zn node move "Ideias" --near "Sol" --side esquerda`. Espere: cada um muda a posição (confira em `zn canvas`).
- [ ] **3.10** `zn node resize "Ideias" 500x400`. Espere: tamanho 500×400 no `zn canvas`.
- [ ] **3.11** `zn node rename "Ideias" "Brainstorm"`; `zn node rename "Brainstorm" "Plano"`.
  Espere: o segundo vira "Plano 2" (não repete nome).
- [ ] **3.12** `zn node front "Plano"` e `zn node back "Plano"`. Espere: z muda no `zn canvas show`.
- [ ] **3.13** `zn node edit "Plano" --color #b2f2bb --formatted sim`. Espere: nota verde e formatada.
- [ ] **3.14** `zn node duplicate "Plano"`. Espere: "Plano 2"/"Plano 3" ao lado com o **mesmo texto**.
  Duplique a imagem "Logo" e apague a cópia: a original continua aparecendo.
- [ ] **3.15** `zn node delete "Plano 2"`. Espere: some; o usuário aperta Ctrl+Z e volta **(usuário)**.
- [ ] **3.16** `zn node delete "Sol"`. Espere: erro "O Sol não pode se apagar".
- [ ] **3.17 Nome repetido.** Crie dois textos iguais com `zn draw texto "Igual"` (duas vezes) e rode
  `zn node delete "Igual"`. Espere: erro "Há 2 itens chamados..." com os ids; apague um pelo `#id`.

## 4. Ligações

- [ ] **4.1** `zn connect "Comum" "Plano"`. Espere: linha na tela. Repita: erro "já estão conectados".
- [ ] **4.2** `zn disconnect "Plano" "Comum"` (ordem invertida). Espere: linha some. Repita: erro "não estão ligados".
- [ ] **4.3** `zn connect "Desenho qualquer" ...` com o `#id` de um desenho. Espere: erro "Desenhos não se ligam".

## 5. Equipe

- [ ] **5.1** `zn recruit "Revisor" --agent codex`. Espere: terminal Codex novo, ligado ao Sol, abre na pasta da galáxia.
- [ ] **5.2** Com uma conta extra do Codex criada no app (usuário cria em Configurações → Contas, ex.: "Conta de teste"):
  `zn recruit "Revisor 2" --agent codex --account "Conta de teste"`. Espere: o cabeçalho mostra a conta "Conta de teste".
  `--account "Não existe"`: erro listando as contas.
- [ ] **5.3** `zn recruit "Shell" --agent shell --cwd C:\teste-sol --link "Plano"`. Espere: PowerShell na pasta, ligado ao Sol e ao Plano.
- [ ] **5.4** `zn recruit "Cmd" --command "cmd"`. Espere: terminal rodando cmd.
- [ ] **5.5** `zn recruit "X" --agent inventado`. Espere: erro "Agente desconhecido".
- [ ] **5.6** `zn replace "Revisor" --agent claude` (se o Claude estiver instalado; senão `--agent shell`).
  Espere: no mesmo lugar e tamanho, mesmo nome, mesmas ligações, agora com o outro agente.
- [ ] **5.7** `zn dismiss "Shell"`. Espere: terminal some. `zn dismiss "Plano"`: erro "é nota, não terminal".
- [ ] **5.8 Conversa.** `zn ask "Revisor" --no-wait "diga oi"`. Espere: a mensagem chega no Revisor.

## 6. Terminal

- [ ] **6.1** `zn terminal edit "Revisor" --color #e03131 --font-size 16`. Espere: cor e letra mudam na hora.
- [ ] **6.2** `zn terminal edit "Revisor" --model gpt-6-sol --effort low`. Espere: aviso "Vale a partir de:
  zn terminal restart"; `zn canvas show "Revisor"` mostra `codex -m gpt-6-sol -c model_reasoning_effort=low`.
  Num Antigravity: `--effort max` vira `--effort max`; num Claude: `--model opus` vira `--model opus` e
  `--effort` dá erro "não tem esforço". `--effort turbo` no Codex: erro listando os aceitos.
- [ ] **6.3** `zn terminal restart "Revisor"`. Espere: a sessão reinicia e o Codex abre com o esforço baixo.
- [ ] **6.4** `zn terminal stop "Revisor"`. Espere: processo encerrado, o nó continua (bolinha de status apagada).
  Repita: erro "já está encerrado". Depois `zn terminal restart "Revisor"` abre de novo.
- [ ] **6.5** `zn terminal stop "Sol"`. Espere: erro "não pode reiniciar nem parar a si mesmo".

## 7. Status por tarefa

- [ ] **7.1** No terminal "Revisor" (ou peça para o Revisor rodar): `zn status trabalhando "revisando o login"`.
  Espere: selo azul "Trabalhando: revisando o login" no cabeçalho dele.
- [ ] **7.2** No Sol: `zn canvas`. Espere: a linha do Revisor termina com "trabalhando: revisando o login".
- [ ] **7.3** `zn status bloqueado "falta senha"` → selo vermelho; `zn status pronto` → verde;
  `zn status livre` → selo some. `zn status inventado`: erro listando os estados.
- [ ] **7.4** `zn list` no Sol (com o Revisor ligado). Espere: o status aparece junto do Revisor.

## 8. Papéis salvos

- [ ] **8.1** `zn role save "Revisor" "Você é o revisor. Leia o último commit e responda com zn reply."`.
  Espere: "Papel salvo". `zn role list` mostra; `zn role show "revisor"` (minúsculo) mostra o texto.
- [ ] **8.2** `zn recruit "Rev" --agent codex --role "Revisor"`. Espere: alguns segundos depois de o
  Codex abrir, o texto do papel aparece como primeira mensagem no terminal "Rev".
- [ ] **8.3** `zn recruit "Y" --agent shell --role "Não existe"`. Espere: erro "Papel ... não existe" e nada criado.
- [ ] **8.4** `zn role delete "Revisor"`; `zn role list`. Espere: some da lista.

## 9. Astros (fluxos)

- [ ] **9.1** `zn flow create ignicao "Início" --input "olá"`. Espere: Ignição criada.
- [ ] **9.2** `zn flow create satelite "Resumidor" --prompt "Resuma: {{entrada}}" --agent codex --effort low`.
  `zn flow show "Resumidor"`: mostra prompt, agente e esforço.
- [ ] **9.3** `zn flow create gemeos "Decide" --config '{"condition":{"op":"contains","value":"OK"}}'`;
  `zn connect "Decide" "Plano"`: erro "várias saídas"; `zn connect "Decide" "Plano" --output a`: liga pela A.
- [ ] **9.4** `zn flow create torre "Rotas" --config '{"routes":[{"id":"r1","label":"Bug","match":"erro"},{"id":"r2","label":"Ideia","match":"ideia"}]}'`.
  Espere: Torre com saídas Bug, Ideia e Outros. Ligue `--output r2` a algo e depois
  `zn flow edit "Rotas" --config '{"routes":[{"id":"r1","label":"Bug","match":"erro"}]}'`: a linha da r2 some.
- [ ] **9.5** `zn flow create ignicao "Relógio" --every 30`. Espere: cartão "A cada 30 min".
  `zn flow pause "Relógio"`: cartão "Pausada". `zn flow resume "Relógio"`: volta "A cada 30 min".
- [ ] **9.6** `zn flow create ignicao "Diário" --daily 09:00 --days 1,2,3,4,5`. Espere: o cartão mostra "Seg, Ter, Qua, Qui, Sex às 09:00".
- [ ] **9.7** `zn flow create propulsor "Espera" --script "Start-Sleep 20; 'fim'"` e ligue
  `"Início" → "Espera" → "Comum"`. Rode `zn flow run "Início"`, e em seguida `zn flow status "Início"`.
  Espere: "rodando agora" e "Espera: rodando".
- [ ] **9.8** Logo depois, `zn flow stop "Início"`. Espere: "Parando"; ao fim dos 20 s, o "Comum" **não**
  recebe "fim" e `zn flow status "Início"` mostra "Parado antes deste passo" no passo seguinte.
- [ ] **9.9** `zn flow stop "Início"` com nada rodando. Espere: erro "não está rodando".
- [ ] **9.10** `zn flow delete "Decide"`. Espere: some com as linhas. `zn flow delete "Plano"`: erro "não astro".

## 10. Desenho (Excalidraw)

- [ ] **10.1** `zn draw retangulo --at 0,1200 --size 300x150 --fill #a5d8ff --fill-style solid --stroke #1971c2`.
- [ ] **10.2** `zn draw elipse --near "Plano" --side direita --stroke-style dashed --rough 2`.
- [ ] **10.3** `zn draw losango --at 400,1200 --opacity 50`.
- [ ] **10.4** `zn draw linha --points "0,1500 300,1500"` e `zn draw lapis --points "0,1600 40,1630 80,1600 120,1640"`.
- [ ] **10.5** `zn draw seta --from "Sol" --to "Plano" "manda o plano" --stroke #e03131`. Espere: seta
  vermelha do Sol ao Plano. Arraste o Plano com o mouse **(usuário)**: a ponta da seta acompanha.
- [ ] **10.6** `zn node move "Plano" --by 300,0`. Espere: a seta acompanha também quando o Sol move.
- [ ] **10.7** `zn draw quadro "Equipe" --around "Sol;Revisor"`. Espere: quadro em volta dos dois, atrás deles.
  `zn node move "#<id do quadro>" --by 0,200`: Sol e Revisor andam junto com o quadro.
- [ ] **10.8** `zn draw texto "Sprint 1" --near "Plano" --side acima --font-size 36 --font sans`.
- [ ] **10.9** `zn draw edit "Sprint 1" --text "Sprint 2" --stroke #2f9e44`. Espere: texto e cor mudam.
- [ ] **10.10** `zn draw estrela`. Espere: erro listando as formas. `zn draw seta`: erro pedindo `--points` ou `--from/--to`.
- [ ] **10.11** Selecione um desenho do Sol na tela **(usuário)**: dá para mudar estilo pelo painel e apagar.

## 11. Tela

- [ ] **11.1** `zn canvas arrange`. Espere: o canvas se organiza; Ctrl+Z desfaz **(usuário)**.
- [ ] **11.2** `zn canvas fit` e `zn canvas fit "Plano"`. Espere: enquadra tudo / o Plano.
- [ ] **11.3** `zn canvas summary on` e `zn canvas summary off`. Espere: liga e desliga a visão resumida.
- [ ] **11.4** `zn canvas background grid`, `stars`, `dots`. Espere: fundo muda. `xadrez`: erro com as opções.
- [ ] **11.5** `zn canvas screenshot` e `zn canvas screenshot "Plano"`. Espere: caminho de um PNG; abra e
  confira que mostra o canvas (o segundo, enquadrado no Plano).
- [ ] **11.6** `zn canvas export C:\teste-sol\canvas.zenite --kinds nota,terminal`. Espere: "N itens exportados".
  Importe o arquivo pelo app (Importar canvas) **(usuário)**: vêm só notas e terminais.
- [ ] **11.7** `zn canvas log`. Espere: uma linha por comando do Sol, com hora, "Sol" e o que mudou.

## 12. Lotes

- [ ] **12.1** Crie `lote.json` com
  `[{"op":"create","kind":"note","title":"A"},{"op":"create","kind":"note","title":"B"},{"op":"connect","from":"A","to":"B"}]`
  e rode `zn canvas apply lote.json`. Espere: A e B ligados; **um** Ctrl+Z tira os três **(usuário)**.
- [ ] **12.2** Lote com o segundo passo errado (`{"op":"delete","target":"Ninguém"}`). Espere: erro
  "Operação 2: ..." e **nada** muda (nem o primeiro passo).
- [ ] **12.3** `Get-Content lote.json | zn canvas apply -`. Espere: funciona pela entrada padrão.

## 13. Sol usando sem ligação

- [ ] **13.1** Sem ligar o Sol à tabela "Preços": `zn table read "Preços"`. Espere: mostra a tabela.
- [ ] **13.2** O mesmo no "Comum" (não Sol): erro "existe no canvas, mas não está ligado a você".
- [ ] **13.3** `zn note append "Plano" "linha do Sol"` sem ligação. Espere: a linha aparece na nota.

## 14. Universos (precisa de git)

- [ ] **14.1** `zn universe list`. Espere: "Você está em: Origem" e nenhum universo.
- [ ] **14.2** `zn universe create "Experimento"`. Espere: "criado (branch universo/experimento)"; a tela
  do usuário **continua na Origem**, e o chip "Experimento" aparece na barra de universos.
- [ ] **14.3** `zn recruit "Exp" --agent shell --universe "Experimento"`. Espere: "no universo". Abra o
  universo na tela **(usuário)**: o terminal "Exp" está lá, rodando na pasta da cópia (prompt mostra o caminho).
- [ ] **14.4** Do Sol (na Origem): `zn ask "Exp" --no-wait "echo oi"`. Espere: chega no terminal do universo.
- [ ] **14.5** No terminal "Exp": crie um arquivo (`"x" > novo.txt`). No Sol: `zn universe status "Experimento"`.
  Espere: "1 arquivo sem commit".
- [ ] **14.6** `zn universe commit "Experimento" "arquivo novo"`; `zn universe status` mostra "1 à frente".
- [ ] **14.7** `zn universe merge "Experimento" --keep`. Espere: o commit chega na Origem (`git log` na
  pasta da galáxia) e o universo continua.
- [ ] **14.8** `zn universe delete "Experimento"`. Espere: erro pedindo `--force`. Com `--force`: o universo,
  o terminal "Exp" e a branch somem.
- [ ] **14.9** `zn universe create "Copia" --clone`. Espere: o canvas do universo nasce com o layout da Origem.

## 15. Canvas fechado

- [ ] **15.1** Com o usuário olhando **outra galáxia** **(usuário)**, rode no Sol:
  `zn recruit "Fora" --agent shell` e `zn node create nota "Nota fora" --text "oi"`. Espere: sem erro.
- [ ] **15.2** Volte para a galáxia "Teste Sol" **(usuário)**. Espere: "Fora" já está rodando (o prompt já
  está na tela, não abre do zero) e a "Nota fora" tem "oi".
- [ ] **15.3** Com a galáxia fechada: `zn canvas arrange`. Espere: erro "não está aberto na tela".

## 16. O Sol comandando os CLIs (zn agent)

Use um terminal Codex "Cx" (`zn recruit "Cx" --agent codex --effort low`) e, se houver conta, um
Antigravity "Ag" (`zn recruit "Ag" --agent antigravity --account "<conta>"`). Espere uns 10 s o CLI abrir.

- [ ] **16.1** `zn agent "Cx"`. Espere: "Codex · livre", o comando com `model_reasoning_effort=low`, os
  esforços aceitos e o uso medido pelo Zênite (5h/semana), se já houver.
- [ ] **16.2** `zn agent status "Cx"`. Espere: linhas Model (com "reasoning low"), Account, Permissions,
  "5h limit: N% left" e "Weekly limit: N% left".
- [ ] **16.3** `zn agent effort "Cx" high` e depois `zn agent status "Cx"`. Espere: "reasoning high"; a
  mensagem diz "só nesta sessão". Volte com `zn agent effort "Cx" medium`.
- [ ] **16.4** `zn agent model "Cx" "GPT-6-Sol" --effort medium` (use um nome que aparece no /model dele).
  Espere: status mostra o modelo novo. Volte para o anterior do mesmo jeito.
- [ ] **16.5** `zn agent commands "Cx"`. Espere: uns 50 comandos com descrição (/model, /status, /review,
  /compact...). Rode de novo: vem da lista guardada; `--fresh` lê de novo.
- [ ] **16.6** `zn agent run "Cx" "/model"`. Espere: a tela com o menu "Select Model". Depois
  `zn agent pick "Cx" "(current)"` (vai para o esforço) e `zn agent interrupt "Cx"` (fecha sem mudar).
- [ ] **16.7** `zn agent run "Cx" "/diff"` e `zn agent run "Cx" "/compact"`. Espere: a tela de cada um.
- [ ] **16.8 Ocupado.** Mande um pedido longo ao Cx (`zn ask "Cx" --no-wait "conte até 50 devagar"`) e
  logo rode `zn agent status "Cx"`. Espere: após ~10 s, erro "está trabalhando agora". Com `--force`, vai.
  `zn agent interrupt "Cx"` para o trabalho.
- [ ] **16.9** `zn agent usage "Ag"`. Espere: "Weekly Limit Remaining" e "Five Hour Limit Remaining" por grupo.
- [ ] **16.10** `zn agent effort "Ag" medium`; `zn agent run "Ag" "/effort"` mostra o controle no meio;
  `zn agent slide "Ag" high` volta para o fim.
- [ ] **16.11** `zn agent model "Ag" "Gemini 3.8 Flash" --effort high`. Espere: "trocado".
- [ ] **16.12** `zn agent status "Sol"`: erro "não comanda o próprio CLI". No terminal "Comum" (não Sol):
  `zn agent "Cx"`: erro "Só o Sol".
- [ ] **16.13 Claude (se instalado).** `zn recruit "Cl" --agent claude --model sonnet`; `zn agent status "Cl"`,
  `zn agent usage "Cl"`, `zn agent model "Cl" opus`, `zn agent commands "Cl"`. Anote o que cada um mostrou
  (o Claude não foi testado ao vivo por não estar instalado nesta máquina).

## 17. Copiar entre canvases e selos guardados

- [ ] **17.1** Com um universo "Experimento" criado (item 14.2): `zn node copy "Plano" --to "Experimento"`.
  Abra o universo **(usuário)**: a nota está lá com o mesmo texto; a original continua na Origem.
- [ ] **17.2** `zn node move "Plano" --to "Experimento"`: some da Origem e aparece no universo. Ctrl+Z na
  Origem traz de volta **(usuário)**. `zn node move "Plano" 100,100` (sem --to) continua mudando a posição.
- [ ] **17.3** `zn node copy "Sol" --to "Experimento"`: erro "Terminal não muda de canvas". `--to "Nenhum"`: erro.
- [ ] **17.4** Do Sol num universo: `zn node copy "X" --to Origem` leva para a Origem.
- [ ] **17.5 Selos.** Ponha `zn status trabalhando "teste"` num terminal, feche e abra o Zênite **(usuário)**.
  Espere: o selo continua lá (selos com mais de 7 dias somem).

## 18. F12 dos sites (zn web console/network/request/source/cookies)

Vale para qualquer agente ligado ao site (não só o Sol). Use um site que faça requisições, por
exemplo `zn web create https://jsonplaceholder.typicode.com "API"` ou o app que você está desenvolvendo.

- [ ] **18.1** Logo depois de criar o site: `zn web network "API"`. Espere: a primeira linha é o
  `GET 200 Document` da página e aparecem os scripts/CSS do carregamento inicial.
- [ ] **18.2** `zn web eval "API" "console.log('oi', {a:1}); console.warn('cuidado'); setTimeout(() => { throw new Error('falhou') })"`
  e `zn web console "API"`. Espere: `log oi {a: 1}`, `AVISO cuidado` e `ERRO [não tratado] Error: falhou`.
  `zn web console "API" --errors` mostra só o aviso e o erro.
- [ ] **18.3** `zn web eval "API" "fetch('/posts', {method:'POST', body: JSON.stringify({title:'x'}), headers:{'content-type':'application/json'}}).then(r => r.status)"`.
  `zn web network "API" --filter posts` mostra o `POST 201`; `zn web request "API" N` mostra o corpo
  enviado `{"title":"x"}` e a resposta.
- [ ] **18.4** `zn web network "API" --failed` lista só o que falhou ou deu 4xx/5xx.
- [ ] **18.5** `zn web source "API"` lista os arquivos; `zn web source "API" "<pedaço de um .js>"` mostra o
  código; `--out C:\teste-sol\arquivo.js` salva inteiro.
- [ ] **18.6** Num site com login (ex.: o seu app local depois de entrar **(usuário)**): `zn web cookies "Site"`
  mostra os cookies com [HttpOnly]; `zn web request` de uma chamada da API mostra o `cookie:` enviado.
- [ ] **18.7** `zn web console "API" --clear`, depois `zn web reload "API"`: o console recomeça com
  "----- Navegou para ...".
- [ ] **18.8** Um agente **sem ligação** com o site: `zn web console "API"` dá "não está ligado".
- [ ] **18.9** Feche a galáxia do site **(usuário)**: `zn web network "API"` dá "não está aberto na tela".
- [ ] **18.10** Abra o DevTools do site pelo app, se houver como **(usuário)**, e rode `zn web console` de
  novo: anote se continua funcionando com o DevTools aberto.

## 19. Ponta a ponta com o agente

- [ ] **19.1** Peça ao Sol, em linguagem natural: "monte uma equipe com um Codex revisor e um Codex
  implementador, ligue os dois a você e à nota Plano, desenhe um quadro 'Equipe' em volta e uma seta
  do implementador para o revisor". Espere: ele usa `zn recruit`, `zn connect`, `zn draw` sozinho e o
  canvas fica como pedido. Anote os comandos que ele usou e se errou algum.
- [ ] **19.2** Peça: "crie um fluxo que todo dia às 9h resume a nota Plano e manda o resumo para o
  revisor". Espere: Ignição diária → Satélite → terminal, configurados e ligados.
- [ ] **19.3** Peça: "veja o status e o uso de cada agente da equipe e passe para esforço alto quem
  estiver em baixo". Espere: ele usa `zn agent status`/`usage` e `zn agent effort` sozinho.
- [ ] **19.4** Peça: "desfaça tudo o que você fez nos últimos 5 minutos". Espere: o Sol explica que quem
  desfaz é o usuário com Ctrl+Z (ou apaga pelo `zn`), e o `zn canvas log` mostra o que foi feito.

## 20. Tela dos cartões: ajustar, 720p, 1080p (usuário)

Configurações → Canvas → "Tela dos cartões". Automático: `npm run test:ui` já roda o terminal em
1080p (seleção, Ctrl+C, Ctrl+V) e o site em 1080p (a página vê 1920 px e o clique acerta o botão).

- [ ] **20.1** Em "Ajustar ao cartão", tudo fica como antes.
- [ ] **20.2** Em 1080p, um site como https://github.com aparece como num monitor (menu completo, não a
  versão de celular), menor dentro do cartão. Clicar, rolar e digitar funcionam no lugar certo.
- [ ] **20.3** Em 1080p, um terminal Codex/PowerShell ganha muitas colunas (linhas longas não quebram).
  Selecionar com o mouse e copiar pega o texto debaixo do mouse; colar funciona.
- [ ] **20.4** Aumente um cartão até ficar mais largo que 1920 px (ou use 720p num cartão largo): ele volta
  a ser desenhado no tamanho real, sem reduzir.
- [ ] **20.5** Notas, tabelas e pastas em 720p: o conteúdo fica menor e cabe mais coisa; dá para editar normal.
- [ ] **20.6** Redimensionar o cartão com a tela emulada: o conteúdo acompanha sem travar.
- [ ] **20.7** Com o zoom do canvas em 50% e 1080p, o texto fica pequeno demais? Anote em que tamanho
  de cartão a leitura fica boa (isso diz se vale um modo intermediário, como 900p).

## 21. Pedir confirmação para fechar (usuário)

Use apenas terminais de teste, pois confirmar o fechamento encerra também os agentes trabalhando.
Ao terminar, deixe a opção "Pedir confirmação para fechar" ativada.

- [x] **21.1 Opção ativada.** Em Configurações → "Ao fechar", ative "Pedir confirmação para fechar".
  Com terminais abertos, tente fechar a janela. Espere: diálogo "Fechar o Zênite?", com a quantidade
  de terminais e o aviso de que agentes trabalhando também serão encerrados.
- [x] **21.2 Cancelar.** Clique em "Cancelar". Espere: o app continua aberto e os terminais continuam
  funcionando. Repita e teste Escape e clique fora do diálogo: também cancelam o fechamento.
- [x] **21.3 Confirmar.** Tente fechar novamente e clique em "Fechar e encerrar". Espere: o app fecha
  e os processos dos terminais de teste são encerrados. Abra o app de novo para continuar.
- [x] **21.4 Opção desativada.** Desative "Pedir confirmação para fechar" e feche com terminais de
  teste abertos. Espere: fecha sem perguntar. Reabra e confira que a opção continua desativada.
- [x] **21.5 Não perguntar de novo.** Reative a opção, tente fechar com terminais abertos, marque
  "Não perguntar de novo" e confirme em "Fechar e encerrar". Reabra: a opção está desativada e o
  próximo fechamento com terminais abertos não pede confirmação.
- [x] **21.6 Sem terminais.** Reative a opção e encerre todos os terminais. Feche a janela.
  Espere: fecha sem perguntar, pois não há terminais abertos.

Resultado em 21/10: seis cenários executados no app real em perfis descartáveis, por eventos internos
da janela, sem entrada global. Cancelar, Escape e clique fora preservaram a janela e o processo;
confirmar encerrou o terminal; opção desativada e "Não perguntar de novo" persistiram após reabrir;
sem terminais, fechou sem perguntar. Resultados em `out/close-real-qa/*-result.json`.

## 22. Sol respeitando as permissões globais

Validado em 21/10 na janela "Sol: teste das três permissões", usando os controles internos do app,
sem tomar o mouse ou teclado global. O Codex já estava aberto ao ser promovido.

- [x] **22.1 Sempre perguntar.** Promover a Sol com "Sempre perguntar" nas configurações mantém
  `Permissions: Workspace (Ask for approval)`. Não abre a confirmação de Full Access nem envia
  `Now you have Full-acess allowed, stop ask me`.
- [x] **22.2 Sandbox.** Promover a Sol com "Sandbox" mantém o processo iniciado com
  `--sandbox workspace-write --ask-for-approval never`. Status real: `Custom (workspace, never)`.
  Não concede Full Access e não envia o prompt de acesso total.
- [x] **22.3 Acesso total.** Promover a Sol com "Acesso total" muda a sessão atual do Codex para
  Full Access, confirma o aviso e envia exatamente `Now you have Full-acess allowed, stop ask me`.
  O identificador da sessão permaneceu igual: não reiniciou nem perdeu a conversa.
- [x] **22.4 Opções antigas.** Testes automáticos confirmam que opções antigas de bypass na linha
  de comando não prevalecem sobre "Sempre perguntar" ou "Sandbox" nas configurações.
- [x] **22.5 Escrita fora da sandbox.** Pedir ao agente uma escrita inofensiva fora do projeto,
  sem pedir elevação nem recorrer ao Sol/outros agentes. Esperar bloqueio e conferir que não criou o arquivo.
  Resultado: uma tentativa real de `Set-Content` para `out/visual-sol-policy/fora-da-sandbox.txt`
  retornou `Access to the path ... is denied` (exit 1). O arquivo não existe; não houve elevação.
- [ ] **22.6 Sol salvo/reaberto.** Fechar e reabrir com um Sol salvo em cada modo. Só enviar o prompt
  de acesso total quando a configuração global for "Acesso total".

## Registro da execução visual de 21/10

- O primeiro Sol real criou notas, tabela, terminal, Ignição, Propulsor e Gêmeos; configurou a condição
  `contains OK`, conectou A/B, moveu os elementos e executou as duas entradas. O roteamento A/B passou.
- `--config` com JSON inline falhou por aspas; o próprio Sol corrigiu a configuração e conferiu com
  `flow show`. A criação da tabela multilinha deixou apenas o cabeçalho; ele percebeu e completou as células.
- Nota e tabela conectadas ao astro não receberam escrita. O motor atual as trata como contexto.
  O terminal Shell recebeu a saída, mas tentou executá-la como comando; texto livre produziu erro no Shell,
  sem erro no status do fluxo. Não considerar isso prova de entrega bem-sucedida para um agente.
- FALHOU: `zn ask --no-wait --file` com pedido longo (~2 mil caracteres) ficou em `[Pasted Content ...]`
  no Codex, sem submeter. Foi necessário um Enter adicional pelo canal interno para continuar.
- A primeira tentativa de promoção automática revelou que descrições de menu quebradas em duas linhas
  eram contadas como opções. Corrigido com teste de regressão; a validação real dos três modos acima passou.
- Confirmação de fechamento: o diálogo exibiu corretamente dois terminais abertos; Cancelar manteve
  o app e os terminais funcionando. Os demais casos da seção 21 continuam pendentes.
- Os itens restantes não estão aprovados por associação com a suíte automática; precisam de execução
  específica. Os elementos dos cenários visuais foram preservados nos perfis descartáveis em `out/visual-sol*`.

### Sete astros executados pelo Sol real

No perfil `out/visual-sol-policy-final`, o próprio Sol criou os sete tipos, configurou, conectou e
executou os cenários. Relatos e evidências estão nas notas "Relatório dos astros" e "Relatório visual".

- Satélite: resposta real `VIS-SATELITE: estrela confirmada`, observada no terminal Receptor.
- Gêmeos: entradas SIM e NAO seguiram pelos ramos A e B, respectivamente, com propulsores ok.
- Torre: ALFA, BETA e GAMA seguiram por Alfa, Beta e Outros. Ao remover r2 da configuração, a ligação
  Beta desapareceu. O primeiro comando usou `other`, foi rejeitado e o Sol corrigiu para `else`.
- Gravidade: duas execuções distribuídas entre Destino um e Destino dois.
- Propulsor: execução simples aprovada; fluxo longo interrompido durante o passo atual, e o passo
  seguinte recebeu "Parado antes deste passo". O marcador proibido não chegou ao Receptor.
- Ignição: diária às 09:00, pausa/retomada/pausa confirmadas, execução manual conferida. O disparo
  automático das 09:00 não foi observado; o astro ficou pausado para não executar depois do teste.
- Órbita: o primeiro cenário rodou uma volta porque faltava a ligação de retorno do contador para
  a Órbita. O Sol corrigiu a ligação e repetiu: status `ok (3/3) — Terminou na volta 3`, contador e saída
  final ok. No Receptor chegaram duas novas mensagens do corpo e uma de fim. O relato inicial de
  defeito no motor foi retirado; o grafo anterior estava incompleto.
- Manipulação: nota movida e redimensionada para 600×380, ligação ao Satélite removida e recriada,
  quadro envolvendo os sete astros criado e canvas enquadrado.
- FALHOU: o Receptor recebeu mensagens, mas suas ferramentas não herdaram corretamente o ambiente
  `zn`/`O_TERMINAL_ID`; não conseguiu acrescentar os resultados na nota. Entrega visual e persistência
  são resultados diferentes: a nota "Saídas dos fluxos" permaneceu apenas com o texto inicial.
- FALHOU: criação e escrita de tabela com CSV multilinha deixaram só o cabeçalho. O Sol completou
  os cinco casos com `table set`, célula por célula, e conferiu a tabela.
- Durante a execução surgiu um erro de log `EPIPE` no processo principal. Acrescentada proteção apenas
  para pipes de stdout/stderr fechados; dois testes reais confirmam sobrevivência e preservação de erros
  de outro tipo. Não oculta erros no canal de controle do Zênite nem nos fluxos.
- Suíte após a correção de EPIPE: 199 testes, 198 aprovados, 0 falhas, 1 pulado (exclusivo de Linux).
- O agente Sol atingiu o limite de uso da conta depois do reteste da Órbita. Os testes adicionais por
  CLI interno são identificados separadamente; não equivalem a novas decisões autônomas do agente.

### Continuação pelo canal interno, sem controle global da tela

Resultados detalhados em `out/visual-sol-policy-final/extended-results.json` e `recheck-results.json`.
Passaram 13 grupos distintos de verificações (o 14º grupo apenas gravou o resumo):

- Leitura do canvas em JSON, alvo inexistente e recusa do supervisor sem papel de Sol.
- Criação de notas, nomes únicos, posição absoluta/relativa, tamanho, renomeação, ordem e formatação.
- Duplicação preservando o texto armazenado.
- Arquivo, pasta e imagem reais; cópia da imagem removida sem apagar o arquivo da original;
  extensão inválida e site sem URL recusados.
- Conexões, duplicata recusada e desconexão pela ordem invertida; autopreservação do Sol,
  agente inexistente e dispensa de elemento que não é terminal recusados.
- Aparência, parar/reiniciar terminal e selos trabalhando/bloqueado/pronto/livre; estado inválido recusado.
- Papéis salvos, busca sem diferenciar maiúsculas, remoção e recrutamento com papel inexistente recusado.
- Lote válido, rollback integral de lote inválido e lote pela entrada padrão.
- Retângulo, elipse, losango, linha, lápis, texto e edição; forma inválida, seta incompleta e nomes
  ambíguos recusados.
- Visão resumida, fundos, screenshot por nó, arquivo exportado e registro de comandos.
- Universo com git real: criação sem trocar a tela, recrutamento no universo, alteração, status,
  commit, merge mantendo universo, cópia com conteúdo e exclusão com confirmação por `--force`.
- Canvas efetivamente fechado: criação de nota e terminal, processo iniciado fora da tela,
  organização recusada, reabertura com texto preservado.
- Substituir Shell por Codex, editar modelo/esforço, esforço inválido recusado e substituir de volta.

As duas falhas iniciais do verificador foram corrigidas na preparação e retestadas: ele consultava
o PTY antes de o renderer abri-lo e chamava setActive sem atualizar o canvas exibido. Não eram falhas
do app. Os três grupos da repetição passaram.

### Propulsor e permissões globais

Teste de integração no app real (`out/script-policy-qa/results.json`), com decisão do diálogo simulada
apenas no perfil descartável e verificação da presença/ausência de arquivos fictícios:

- Sempre perguntar + Cancelar: diálogo solicitado, script não executou.
- Sempre perguntar + Executar: diálogo solicitado, script executou.
- Sandbox: nenhum script nem diálogo de aprovação; execução recusada.
- Acesso total: execução permitida sem diálogo.

O modo Sempre perguntar exige confirmação explícita antes do PowerShell do Propulsor; Sandbox o
recusa porque esse subprocesso não tem isolamento. Os agentes dos astros também recebem o teto de
permissões global. A checagem de tipos e os testes dessas decisões passaram.
Suíte final desta continuação: 200 testes, 199 aprovados, nenhuma falha e um pulado por ser exclusivo
de Linux. O build do processo principal foi recompilado após a mudança.

Continuam sem aprovação integral: disparo diário real às 09:00, qualidade de leitura em zoom baixo,
alguns casos de mouse/estilo e reabertura com o Sol salvo em cada modo. As três falhas reproduzidas de
produto (pedido longo sem submeter, CSV multilinha e ambiente do Receptor) continuam registradas,
sem correção nesta rodada de testes. A proteção do EPIPE está compilada; janelas já abertas ainda
precisam reabrir para carregá-la.

### Compatibilidade com a autoridade de sessão e as integrações — 21/10

O cenário `tests/e2e/canvas-sol.check.cjs` agora usa `SunAuthority` no perfil de teste:
o dono do cenário concede a função na sessão, em vez de confiar no campo `sun` salvo.
Isso elimina a falha do teste antigo sem afrouxar a autorização do aplicativo.

O cenário passou em janela visível: recrutamento, criação e edição de elementos,
conexões, movimentação, desenhos presos aos elementos, astros, organização,
desfazer, exportação e mudanças em canvas fechado. `npm run test:ui` executa esse
cenário com `--visible` e inclui também os testes reais de segurança e integrações.
