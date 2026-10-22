// Canvas gigante do comercial: um projeto grande em andamento, organizado em áreas
// (planejamento, desenvolvimento, painel, qualidade e operação, automação, design).
// Terminais fazem trabalho local real; os painéis admin leem o estado deles. Só monta o estado.
const { copyFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
module.exports = ({ root, profile, project }) => {
  const nodes = [], edges = [];
  const el = (id, kind, title, x, y, width, height, extra = {}) => nodes.push({ id, kind, x, y, width, height, element: { id, kind, title, ...extra } });
  const note = (id, title, text, x, y, color, width = 420, height = 320) => { writeFileSync(join(profile, 'notes', id + '.md'), text); el(id, 'note', title, x, y, width, height, { formatted: true, color }); };
  const table = (id, title, rows, x, y, width = 560, height = 330) => { writeFileSync(join(profile, 'tables', id + '.json'), JSON.stringify(rows)); el(id, 'table', title, x, y, width, height); };
  const worker = join(root, 'scripts/video/live-worker.cjs');
  const term = (id, title, role, x, y, color) => nodes.push({ id, kind: 'terminal', x, y, width: 620, height: 380, terminal: { id, title, command: `node '${worker}' '${role}'`, cwd: project, appearance: { color, fontSize: 15 } } });
  const flow = (id, title, x, y, spec) => el(id, 'flow', title, x, y, 285, 160, { flow: spec });
  const ds = { stroke: '#8ea2ff', fill: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, seed: 7, font: 'hand', fontSize: 40, textAlign: 'left' };
  const draw = (id, shape, x, y, width, height, extra = {}) => nodes.push({ id, kind: 'draw', x, y, width, height, z: shape === 'text' ? 10 : -20, draw: { ...ds, shape, ...extra } });
  // Área: moldura tracejada discreta e rótulo grande no canto.
  const zone = (id, label, x, y, width, height, color) => {
    draw(id, 'rectangle', x, y, width, height, { stroke: color, strokeStyle: 'dashed', roughness: 0, opacity: 45, strokeWidth: 2 });
    draw(id + '-label', 'text', x + 30, y + 22, width - 60, 70, { text: label, font: 'sans', fontSize: 44, stroke: color, opacity: 85 });
  };
  const link = (source, target, extra = {}) => edges.push({ id: source + '-' + target, source, target, ...extra });

  // Planejamento.
  zone('z-plan', 'Planejamento', 0, 0, 1100, 1560, '#b18cff');
  note('g-brief', 'Briefing · Aurora', '# Aurora\n\nPainel de tarefas para quem quer foco.\n\n- Adicionar e concluir tarefas\n- Tema escuro e legível\n- HTML, CSS e JS puro\n\n**Entrega:** sexta-feira.', 50, 130, 'blue');
  note('g-roadmap', 'Roteiro da semana', '# Semana 43\n\n1. Protótipo navegável\n2. Revisão de acessibilidade\n3. Empacotar e publicar\n4. Coletar feedback', 520, 130, 'purple', 520, 320);
  table('g-sprint', 'Sprint 43', [['Tarefa', 'Estado', 'Dono', 'Pontos'], ['Layout escuro', 'Pronto', 'Design', '3'], ['Adicionar tarefa', 'Pronto', 'Front', '2'], ['Concluir tarefa', 'Pronto', 'Front', '2'], ['Filtros', 'Em revisão', 'Front', '3'], ['Acessibilidade', 'A seguir', 'QA', '5'], ['Publicação', 'A seguir', 'Ops', '2']], 50, 500, 990, 360);
  note('g-ideas', 'Depois do lançamento', '# Ideias\n\n- Modo foco de 25 min\n- Atalhos de teclado\n- Sincronizar entre aparelhos', 50, 910, 'yellow', 470, 300);
  note('g-decisions', 'Decisões', '# Registradas\n\n- Sem framework\n- Dados só no aparelho\n- Publicar como site estático', 570, 910, 'pink', 470, 300);

  // Desenvolvimento.
  zone('z-dev', 'Desenvolvimento', 1180, 0, 1440, 1560, '#8ea2ff');
  term('g-git', 'Git · histórico', 'git', 1230, 130, '#f5c96b');
  term('g-files', 'Observador de arquivos', 'files', 1230, 560, '#8ea2ff');
  term('g-bundle', 'Empacotamento', 'bundle', 1230, 990, '#ff8cbe');
  el('g-folder', 'folder', 'Projeto Aurora', 1900, 130, 670, 460, { path: project });
  el('g-readme', 'file', 'README.md', 1900, 640, 670, 280, { path: join(project, 'README.md') });
  note('g-review', 'Revisão de código', '# Pontos da revisão\n\n- Foco ao concluir em lista filtrada\n- Contraste dos filtros: ok\n- Teclado: ok\n\n**Próximo:** publicar.', 1900, 990, 'green', 670, 380);

  // Painel admin: o centro do projeto.
  zone('z-dash', 'Painel do projeto', 2700, 0, 1800, 1560, '#4fd1a5');
  el('g-admin', 'web', 'Aurora Admin · visão geral', 2750, 130, 1700, 960, { url: '/admin' });
  table('g-metrics', 'Metas da entrega', [['Métrica', 'Meta', 'Atual'], ['Tempo de carga', '< 1 s', '0,3 s'], ['Tamanho', '< 50 KB', '11 KB'], ['Verificações', '6/6', '6/6']], 2750, 1140, 820, 340);
  note('g-status', 'Status para a equipe', '# Hoje\n\nTudo verde nas verificações.\nPublicação marcada para sexta.', 3620, 1140, 'blue', 830, 340);

  // Qualidade e operação.
  zone('z-ops', 'Qualidade e operação', 4580, 0, 1440, 1560, '#f2c46d');
  term('g-checks', 'Verificação contínua', 'checks', 4630, 130, '#56d6ac');
  term('g-server', 'Servidor local', 'server', 4630, 560, '#8ea2ff');
  term('g-system', 'Monitor do sistema', 'system', 4630, 990, '#f5c96b');
  el('g-infra', 'web', 'Aurora Admin · infraestrutura', 5300, 130, 670, 1240, { url: '/admin?view=infra' });

  // Automação: a cadeia de astros que leva à publicação.
  zone('z-flow', 'Automação', 1180, 1640, 3320, 620, '#ff8cbe');
  flow('g-clock', 'Todo dia às 9h', 1240, 1790, { type: 'chronos', chronos: { mode: 'daily', at: '09:00' } });
  flow('g-start', 'Começar a entrega', 1240, 2010, { type: 'ignition', schedule: 'manual', input: 'Aurora pronto para revisão', paused: true });
  flow('g-join', 'Juntar resultados', 1640, 1900, { type: 'convergence', joinMode: 'all' });
  flow('g-code', 'Resumo em Python', 2040, 1900, { type: 'code', code: { language: 'python', source: 'print(entrada.upper())' } });
  flow('g-wait', 'Aguardar os testes', 2440, 1900, { type: 'wait', waitMode: 'timer', waitSeconds: 5 });
  flow('g-decide', 'Tudo aprovado?', 2840, 1900, { type: 'gemini', condition: { op: 'contains', value: 'PRONTO' } });
  flow('g-approve', 'Aprovação humana', 3260, 1790, { type: 'approval' });
  flow('g-fix', 'Voltar para ajustes', 3260, 2030, { type: 'transform', transform: { operation: 'template', value: 'Ajustar: {{entrada}}' } });
  flow('g-launch', 'Publicar', 3680, 1790, { type: 'launch', launch: { mode: 'open' } });

  // Design: referências e o quadro desenhado da arquitetura.
  zone('z-design', 'Design', 0, 1640, 1100, 620, '#4fd1a5');
  ['01-nebulosa', '03-horizonte', '05-aurora'].forEach((name, i) => {
    copyFileSync(join(root, 'docs/design/backgrounds', name + '.png'), join(profile, 'media', name + '.png'));
    el('g-img' + i, 'image', ['Nebulosa', 'Horizonte', 'Aurora'][i], 50 + i * 340, 1770, 310, 210, { file: name + '.png' });
  });
  draw('g-a1', 'rectangle', 60, 2060, 220, 120, { fill: '#d0bfff', fillStyle: 'hachure', stroke: '#b18cff' });
  draw('g-t1', 'text', 90, 2095, 170, 50, { text: 'Briefing', stroke: '#111527', fontSize: 32 });
  draw('g-a2', 'arrow', 300, 2120, 150, 3, { points: [[0, .5], [1, .5]], strokeWidth: 4 });
  draw('g-b2', 'diamond', 470, 2045, 240, 150, { fill: '#a5d8ff', fillStyle: 'hachure' });
  draw('g-t2', 'text', 520, 2095, 150, 50, { text: 'Agentes', stroke: '#111527', fontSize: 32 });
  draw('g-a3', 'arrow', 730, 2120, 130, 3, { points: [[0, .5], [1, .5]], strokeWidth: 4 });
  draw('g-c3', 'ellipse', 870, 2050, 200, 140, { fill: '#b2f2bb', fillStyle: 'hachure', stroke: '#4fd1a5' });
  draw('g-t3', 'text', 900, 2095, 150, 50, { text: 'Entrega', stroke: '#111527', fontSize: 32 });

  // Ligações entre áreas: contexto → código → painel → operação → automação.
  link('g-brief', 'g-roadmap'); link('g-roadmap', 'g-sprint'); link('g-brief', 'g-git'); link('g-sprint', 'g-admin');
  link('g-git', 'g-files'); link('g-files', 'g-bundle'); link('g-git', 'g-folder'); link('g-folder', 'g-readme'); link('g-bundle', 'g-review');
  link('g-git', 'g-admin'); link('g-bundle', 'g-admin'); link('g-review', 'g-metrics'); link('g-admin', 'g-status');
  link('g-checks', 'g-admin'); link('g-server', 'g-admin'); link('g-system', 'g-infra'); link('g-server', 'g-infra'); link('g-checks', 'g-server');
  link('g-clock', 'g-join'); link('g-start', 'g-join'); link('g-join', 'g-code'); link('g-code', 'g-wait'); link('g-wait', 'g-decide');
  link('g-decide', 'g-approve', { sourceHandle: 'a' }); link('g-decide', 'g-fix', { sourceHandle: 'b' }); link('g-approve', 'g-launch'); link('g-launch', 'g-system');
  link('g-img0', 'g-img1'); link('g-img1', 'g-img2'); link('g-ideas', 'g-img0');
  return { version: 1, nodes, edges, viewport: { x: 40, y: 40, zoom: .2 } };
};
