Novidades:

- **Perguntas do app no diálogo do Zênite:** remover conta ou galáxia, restaurar backup, permissões, aprovações de fluxo, Propulsor e executar programa aparecem no diálogo do app, com o tema escolhido, e não mais na caixa do Windows.
- **Remover conta funciona com terminal aberto:** a conta sai da lista na hora e o login guardado é apagado quando os terminais dela fecharem (ou ao abrir o app).
- **Agentes em ambiente isolado:** terminais de IA podem rodar num contêiner Linux, sem acesso direto ao disco; leitura e escrita passam pelo canvas com sua autorização (`zn access`). Cada conta mantém o próprio login. Padrão de 6 GB e 4 processadores por terminal, ajustável em Configurações → Agentes.
- **Buraco negro:** agrupa elementos do canvas sem fechar nada nem mexer nas ligações. Solte elementos na porta para guardar, abra como pasta para navegar, e o Organizar arruma também o que está dentro.
- **Exportar e importar galáxias** com Origem, universos e elementos, escolhendo se leva conteúdos, mídia e `.env`.
- **Astros novos:** Código (Python e JavaScript), Convergência, Espera e Aprovação. Fluxos agora usam o Cronos e ações nativas: consultar APIs, transformar dados e abrir aplicativos.
- **Skills e serviços conectáveis:** ligue instruções e integrações HTTP/MCP aos agentes do canvas, com as credenciais fora do canvas.
- **Personalização num lugar só:** tema, cores, fontes e ligações reunidos, com cor principal livre (espectro ou hexadecimal) e 13 animações configuráveis nas ligações.
- Visão resumida com elementos circulares e ligações presas à borda; universos paralelos aparecem com dois círculos sobrepostos.
- Claude aceita esforço por terminal (`--effort`) sem mudar o padrão da conta.
- Correções: login do Google nos Sites, tabela com ponto e vírgula entre aspas, terminal recrutado fora da tela e o app não cai mais quando o canal de logs fecha.
