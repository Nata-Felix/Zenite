# Checklist: contas do Codex se misturando (Windows)

Para o agente rodando no Windows, na máquina onde o problema acontece.

## O problema

Fluxo que reproduz:
1. Um terminal Codex é aberto com a conta Zênite A, e o login é feito com o ChatGPT 1.
2. Outro terminal Codex é aberto com a conta Zênite B, e o login é feito com o ChatGPT 2.
3. Na mesma hora, o terminal 1 passa a usar o login do ChatGPT 2. Os dois ficam no mesmo login.

## O que já foi verificado (no Linux)

- **Zênite:** cada conta tem uma pasta própria, `<dados>\contas\<id-da-conta>`. Ao abrir o terminal, o Zênite injeta `CODEX_HOME=<essa pasta>`. Pontos no código:
  - `src/main/accounts.ts`, método `env()`;
  - `src/main/index.ts`, perto da linha 217;
  - `src/main/ptyManager.ts`, função `mergeEnv`.
  - Um teste com o app real e duas contas imprimiu dois `CODEX_HOME` diferentes, um por terminal.
- **Codex:** o login é guardado separado por `CODEX_HOME` nos três modos (`auth.json`, cofre do Windows e armazenamento criptografado). No cofre, a chave é um hash do caminho da pasta (`codex-rs/login/src/auth/storage.rs`, `compute_store_key`).
- **Conclusão:** se os logins se misturam, os dois processos `codex` estão usando **a mesma pasta**. A tarefa é descobrir por quê.

## Regras para quem for investigar

- **Nunca** mostre, copie ou registre o conteúdo de `auth.json`, tokens ou a saída do `cmdkey` com segredos. Compare as contas localmente pelo passo 6; não publique e-mails, identificadores de contas ou caminhos pessoais em issues e logs.
- A pasta de dados é `%APPDATA%\Zenite`. Se existir `%APPDATA%\o` (instalação antiga), ela é usada no lugar.
  - Neste documento, `$D` é essa pasta: `$D = "$env:APPDATA\Zenite"; if (Test-Path "$env:APPDATA\o") { $D = "$env:APPDATA\o" }`

## 1. Que `CODEX_HOME` cada terminal recebe

O teste mais importante.

- [ ] No terminal Codex da conta A, peça ao Codex para rodar `echo $env:CODEX_HOME`. Se ele não rodar, use `!echo $env:CODEX_HOME`.
- [ ] Repita no terminal da conta B.
- [ ] Anote a etiqueta de conta no cabeçalho de cada terminal.

Como ler o resultado:

| Resultado | Significa | Ir para |
|---|---|---|
| Vazio | Terminal sem conta ("Padrão") **ou** a variável não chegou | 2 e 3 |
| Iguais | Mesma conta nos dois, ou algo sobrescreve a variável | 2 e 4 |
| Diferentes, `...\contas\<id>` | O Zênite está certo; o problema está no Codex ou no navegador | 5, 6 e 7 |

## 2. Os terminais estão mesmo em contas diferentes?

- [ ] Liste as contas cadastradas:
  ```powershell
  (Get-Content "$D\workspaces\index.json" -Raw | ConvertFrom-Json).accounts | Format-Table id, name, agent
  ```
- [ ] Veja que conta cada terminal Codex do canvas usa:
  ```powershell
  Get-ChildItem "$D\workspaces\*.json" -Exclude index.json | ForEach-Object {
    $c = Get-Content $_ -Raw | ConvertFrom-Json
    $c.nodes | Where-Object { $_.terminal.command -match 'codex' } |
      ForEach-Object { [pscustomobject]@{ arquivo = $_.PSParentPath; titulo = $_.terminal.title; comando = $_.terminal.command; conta = $_.terminal.account; nome = $_.terminal.accountName } }
  } | Format-Table
  ```
- [ ] Os dois terminais têm `conta` **diferente** e **não vazia**?
  - Se a conta for igual: o segundo terminal foi copiado/colado do primeiro (a cópia leva a conta junto) ou a mesma conta foi escolhida duas vezes. Encontrado. **Correção no app:** colar terminal deve abrir com "Padrão", ou perguntar a conta.
  - Se estiver vazia: o terminal está em "Padrão" e usa `%USERPROFILE%\.codex`. Encontrado.

## 3. Se a conta está certa no canvas, mas `CODEX_HOME` sai vazio

Algo entre o Zênite e o shell perdeu a variável.

- [ ] Qual shell o Zênite usa: Configurações → Terminal → Shell.
- [ ] Teste o PtyManager direto, **com caminho acentuado** (o usuário do Windows tem acento, por exemplo `João Teste`). Use `tests/unit/terminal/pty.test.mjs` como modelo: crie um PTY com `extraEnv` devolvendo `{ CODEX_HOME: 'C:\\Users\\João Teste\\teste' }` e comando `echo $env:CODEX_HOME`. Confira se o acento sai certo.
- [ ] Se a variável some ou sai com acento quebrado: o bug está em `mergeEnv`/`@lydell/node-pty` no Windows. Registre a saída exata.

## 4. Algo sobrescrevendo `CODEX_HOME` depois do Zênite

- [ ] Variável global de usuário ou de máquina:
  ```powershell
  [Environment]::GetEnvironmentVariable('CODEX_HOME','User'); [Environment]::GetEnvironmentVariable('CODEX_HOME','Machine')
  ```
  (O Zênite passa por cima dessas, mas anote.)
- [ ] Perfis do PowerShell. Os perfis rodam **depois** do Zênite e podem trocar a variável:
  ```powershell
  $PROFILE | Get-Member -Type NoteProperty | ForEach-Object { $p = $PROFILE.($_.Name); if (Test-Path $p) { $p; Select-String -Path $p -Pattern 'CODEX' } }
  ```
- [ ] AutoRun do cmd.exe:
  ```powershell
  Get-ItemProperty 'HKCU:\Software\Microsoft\Command Processor','HKLM:\Software\Microsoft\Command Processor' -Name AutoRun -ErrorAction SilentlyContinue
  ```
- [ ] O que é o comando `codex`: um binário, um `.cmd`/`.ps1` do npm, ou uma função/alias de algum "switcher" de contas?
  ```powershell
  Get-Command codex -All | Format-List Name, CommandType, Source, Definition
  codex --version
  ```
  Se for função, alias ou script que define `CODEX_HOME`, você encontrou a causa.

## 5. Onde cada login está sendo gravado

- [ ] Liste as pastas de conta e a pasta padrão:
  ```powershell
  Get-ChildItem "$D\contas" -Directory | ForEach-Object {
    $a = Join-Path $_.FullName 'auth.json'
    [pscustomobject]@{ conta = $_.Name; temAuth = Test-Path $a; alterado = (Get-Item $a -ErrorAction SilentlyContinue).LastWriteTime; config = (Select-String -Path (Join-Path $_.FullName 'config.toml') -Pattern 'cli_auth_credentials_store' -ErrorAction SilentlyContinue).Line }
  } | Format-Table
  Get-Item "$env:USERPROFILE\.codex\auth.json" -ErrorAction SilentlyContinue | Select-Object FullName, LastWriteTime
  Select-String -Path "$env:USERPROFILE\.codex\config.toml" -Pattern 'cli_auth_credentials_store' -ErrorAction SilentlyContinue
  ```
- [ ] Repita o fluxo do problema (login na conta B) e liste de novo. **Qual `auth.json` mudou de data?**
  - Mudou o de B: correto até aqui. Vá para o 6.
  - Mudou o de A ou o de `.codex`: o terminal B não está usando a pasta dele. Volte ao 1–4.
  - Nenhum mudou: o login foi para o cofre do Windows. Confira com `cmdkey /list | Select-String -Pattern 'Codex'` (mostre **só os nomes** das entradas) e vá para o 7.

## 6. Qual conta do ChatGPT está em cada pasta

Compare as contas somente na máquina local. O comando abaixo imprime apenas se os dois
perfis pertencem à mesma conta, sem divulgar e-mail, identificador ou token.

- [ ] Rode:
  ```powershell
  function IdentidadeLocal($f) {
    $j = Get-Content $f -Raw | ConvertFrom-Json
    $p = $j.tokens.id_token.Split('.')[1].Replace('-','+').Replace('_','/')
    while ($p.Length % 4) { $p += '=' }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
    if (-not $claims.email) { throw 'Perfil sem identidade de e-mail; confira o login localmente.' }
    return $claims.email
  }
  # Substitua somente os IDs abaixo pelos dois perfis de teste locais.
  $contaA = IdentidadeLocal (Join-Path $D 'contas\<id-a>\auth.json')
  $contaB = IdentidadeLocal (Join-Path $D 'contas\<id-b>\auth.json')
  [pscustomobject]@{ mesmaConta = ($contaA -eq $contaB) }
  Remove-Variable contaA, contaB
  ```
- [ ] Cada pasta tem o e-mail certo?
  - Pastas diferentes com o **mesmo e-mail**: o navegador reaproveitou a sessão do ChatGPT 1 no login da conta B. A pasta está certa; o login é que entrou na conta errada. Vá para o 7.

## 7. Login do Codex: porta 1455 e navegador

O login pelo navegador usa um servidor local na porta 1455. O navegador mantém a sessão do ChatGPT que já está aberta.

- [ ] Repita o login da conta B do jeito seguro:
  1. No terminal da conta B, rode `codex logout`.
  2. Rode `codex login --device-auth`.
  3. Abra o link **numa janela anônima**, entre com o ChatGPT 2 e digite o código.
- [ ] Depois, rode o passo 6 de novo. Agora A e B têm e-mails diferentes?
- [ ] Os dois terminais continuam separados depois de usar os dois por alguns minutos? Isso confirma que a renovação de token não mistura.
- [ ] Se ainda misturar: teste com `cli_auth_credentials_store = "file"` no `config.toml` **de cada conta** (em `$D\contas\<id>\config.toml`), faça login de novo e repita os passos 5 e 6.

## 8. O que devolver

Responda com:
1. A causa encontrada: o passo e o resultado que a confirmaram.
2. As saídas dos passos 1, 2, 4 e 5. **Sem tokens.**
3. A versão do Codex (`codex --version`) e do Zênite (Configurações → Sobre).
4. Se a causa estiver no Zênite (passos 2 ou 3), a correção proposta com arquivo e linha. Correções candidatas:
   - colar um terminal sem copiar a conta;
   - gravar `cli_auth_credentials_store = "file"` ao criar uma conta Codex;
   - mostrar a pasta da conta no cabeçalho do terminal;
   - ao abrir o terminal, avisar se o `CODEX_HOME` dentro do shell for diferente do esperado.
