# Segurança dos agentes no canvas

## Dados no repositório público

Não publique `.env`, chaves, tokens, `auth.json`, perfis de contas, arquivos exportados do
canvas, backups ou logs de uso real. O `.gitignore` protege os caminhos comuns;
`npm run security:check` também recusa esses arquivos quando já estão rastreados ou são
adicionados à força. Exemplos `.env.example`, `.env.sample` e `.env.template` só podem
conter valores fictícios. Use `example.com` em e-mails de teste e o noreply do GitHub
nos metadados de novos commits públicos.

A [CI](.github/workflows/ci.yml) verifica tipos, testes, build, arquivos publicáveis e
segredos com Gitleaks 8.30.1, inclusive no histórico completo disponível ao checkout.
A configuração mantém as regras padrão e uma exceção restrita a uma linha de atalho de
teclado identificada como falso positivo; diretórios de teste não são excluídos da varredura.
Para repetir a verificação com Gitleaks instalado:

```sh
npm run security:check
gitleaks git . --redact --log-opts="--all"
```

Remover um dado da versão atual não o remove dos commits anteriores, clones, forks,
releases ou caches. Se uma credencial real for exposta, revogue-a no provedor antes de
tratar cópias históricas. A alteração de histórico compartilhado exige coordenação e
muda os identificadores dos commits.

## Autoridade no canvas

A função de Sol é concedida pelo usuário na janela principal do Zênite. O registro de autorização fica em memória e admite um Sol por canvas. É necessário promover novamente após reiniciar o aplicativo. A marca `sun` salva no canvas, o nome do terminal e suas variáveis de ambiente não concedem autoridade.

Cada sessão de terminal usa um token aleatório de 192 bits, associado ao seu identificador. Trocar apenas o ID não autentica outro terminal. Reiniciar o terminal troca o token. Não registre ou compartilhe tokens.

Somente o Sol altera a estrutura pelos comandos do Zênite: criação, remoção, movimento, conexões, substituição de mídia e organização. Outros agentes podem trabalhar no conteúdo dos elementos diretamente ligados a eles, como notas, tabelas e sites. Eles não podem enviar teclas ao Sol nem ler sua tela; pedidos continuam disponíveis pelo canal de mensagens.

Durante a execução, o aplicativo usa cópias privadas do índice (incluindo as permissões globais) e dos canvases. Alterações diretas nesses arquivos não são adotadas pela sessão aberta. Escritas feitas pelos métodos do aplicativo continuam funcionando; uma restauração de backup solicitada na interface atualiza esse estado explicitamente.

## Limite de proteção

Isso protege a autorização e os caminhos internos do aplicativo; não instala isolamento de processos no sistema operacional. Um processo com acesso total sob a mesma conta ainda pode tentar ler memória ou credenciais, alterar arquivos em disco, danificar a instalação ou controlar a interface. Quem possuir o token completo de uma sessão poderá se autenticar como ela. Arquivos adulterados antes da inicialização também não são certificados por esta proteção.

Para uma barreira contra agentes hostis, execute-os em identidades ou ambientes isolados pelo sistema operacional e negue acesso aos dados e processos do aplicativo. O modo Full Access não oferece essa garantia. O Zênite não altera ACLs da conta do usuário nem afirma isolamento completo neste modo.
