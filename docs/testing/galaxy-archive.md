# Pacotes de galáxias

## Uso

- Exportar: botão de download nas ações da galáxia, na barra lateral. Também na busca rápida:
  **Exportar galáxia…** (`Ctrl+Shift+P`).
- Importar: botão de upload no rodapé da barra lateral ou **Importar galáxia…** na busca.
- Formato: `.zenite-galaxia`, contendo Origem e todos os universos.
- Opções independentes: conteúdos, mídia, `.env` e `.env.*`. O `.env` começa desmarcado nos
  dois sentidos. A tela informa que pode conter senhas e tokens e que o pacote não é criptografado.
- Elementos, conexões e agrupamentos permanecem mesmo ao omitir seus conteúdos. Conteúdos
  incluem notas, tabelas, arquivos/pastas, arquivos de apoio de skills e arquivos do projeto.
- Universos são snapshots em pastas próprias; histórico Git e branches não são transportados.
- Contas, login dos agentes, caches, `.git`, `node_modules` e ambientes Python ficam de fora.
- A importação cria novas identificações e pastas sob `galaxias-importadas/` nos dados do app,
  sem alterar o projeto original nem ativar a galáxia. Ignições chegam pausadas. Abrir a galáxia
  inicia seus terminais com os comandos salvos.
- Elementos que apontavam para dentro do projeto continuam apontando para dentro da cópia
  importada; arquivos externos são levados como recursos separados. Pastas vazias são preservadas.

## Validação

Tipos e build passaram. Suíte geral: 248 testes, 247 aprovados, nenhuma falha e um
ignorado por ser específico de Linux. Os seis testes de pacote e o cenário visual
foram repetidos após a revisão das referências do projeto e das pastas vazias; passaram.

- `tests/unit/persistence/galaxy-archive.test.mjs`: roundtrip de Origem/universo, notas, tabelas, imagens,
  arquivos, skills, serviços, elementos de pasta, agrupamentos, ligações, ids e diretórios novos.
- Combinações sem conteúdos, sem mídia e sem .env; exportação de .env independente de conteúdos;
  retirada do .env novamente na importação, mesmo quando incluído pelo remetente.
- Recusa de arquivos truncados/danificados, travessia de pastas, streams NTFS, nomes de dispositivo,
  .env disfarçado de conteúdo, junctions e exportação dentro do próprio projeto.
- Interface real e janela visível: `npm run test:galaxy-archive`. Só os seletores nativos usam
  respostas simuladas; interface, IPC, arquivos, persistência e importador/exportador são reais.
  O cenário inclui cópia completa, .env por escolha explícita, template vazio e erro de pacote inválido.
- Capturas e resultados ficam em `out/galaxy-archive-qa/`, com perfil e segredos fictícios separados.

O pacote é validado por tamanhos e SHA-256 por arquivo. A restauração ocorre numa pasta nova,
com limpeza em caso de falha, e a galáxia só é registrada após validar/copiar todo o conteúdo.
Limites: cabeçalho de 32 MB, até 50 mil arquivos/pastas e 32 GB de arquivos.
