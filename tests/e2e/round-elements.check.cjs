// App real e perfil descartável. Interações enviadas só para esta janela.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/round-elements-qa');
mkdirSync(dir, { recursive: true });
const realApp = process.argv.includes('--real-app');
const profile = mkdtempSync(join(dir, 'profile-'));
app.setPath('userData', profile);
writeFileSync(join(dir, 'preload.cjs'), `require(${JSON.stringify(join(root, 'out/preload/index.js'))});localStorage.setItem('o.summaryView','true');localStorage.setItem('o.canvas',JSON.stringify({v:2,edge:'straight',pulse:true,connectionAnimation:'aurora',hideConnectionLine:true}));`);
const element = (id, kind, title, x, y, extra = {}) => ({ id, kind, x: x * 3, y: y * 3, width: 340, height: 240, summary: { x, y }, element: { id, kind, title, ...extra } });
let canvas = { version: 1, viewport: { x: 65, y: 10, zoom: 1 }, nodes: [
  { id: 'sol', kind: 'terminal', x: 800, y: 400, width: 520, height: 300, summary: { x: 480, y: 290 }, terminal: { id: 'sol', title: 'Codex', command: 'codex', cwd: root, sun: true } },
  element('plano', 'note', 'Plano do projeto', 120, 70),
  element('site', 'web', 'Referências', 790, 70, { url: 'https://example.com' }),
  element('tabela', 'table', 'Resultados', 100, 360),
  element('torre', 'flow', 'Torre de controle', 810, 360, { flow: { type: 'tower', routes: [{ id: 'rota-a', label: 'A' }, { id: 'rota-b', label: 'B' }] } }),
  element('arquivo', 'file', 'Documento', 320, 600),
  element('nota', 'note', 'Próximos passos', 680, 600),
], edges: ['plano', 'site', 'tabela', 'torre', 'arquivo'].map(id => ({ id: 'sol-' + id, source: 'sol', target: id })).concat([{ id: 'rota', source: 'torre', sourceHandle: 'rota-a', target: 'nota' }]) };
const handlers = {
  'workspaces:list': () => ({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Experimento · elementos redondos', dir: root, settings: {} }] }),
  'git:version': () => '2.0', 'git:state': () => ({ installed: true, isRepo: true, hasCommits: true, top: root, pending: 0 }),
  'attention:get': () => ({}), 'update:get': () => ({ status: 'dev' }), 'tasks:get': () => [],
  'canvas-clipboard:get': () => null, 'canvas:load': () => canvas, 'canvas:save': (_e, _id, value) => { canvas = value; },
  'note:read': () => '# Plano\nConteúdo preservado ao abrir o elemento.', 'table:read': () => [['Resultado'], ['Preservado']],
  'pty:cliTheme': () => null,
};
let realReady;
if (realApp) {
  process.env.ZENITE_DATA_DIR = profile;
  const home = join(profile, 'home');
  mkdirSync(join(home, '.agents/skills'), { recursive: true });
  require('node:os').homedir = () => home;
  mkdirSync(join(profile, 'workspaces'), { recursive: true });
  const project = join(profile, 'projeto'); mkdirSync(project);
  canvas.nodes.find(n => n.id === 'sol').terminal.command = '';
  canvas.nodes.find(n => n.id === 'sol').terminal.cwd = project;
  canvas.nodes.find(n => n.id === 'site').element.url = 'about:blank';
  writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Zênite · revisão das ligações', dir: project, universes: [] }], settings: { confirmQuit: false, agentPermissions: 'ask', notifyDone: false, notifyRequest: false } }));
  writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify(canvas));
  writeFileSync(join(dir, 'real-seed.cjs'), `if(!localStorage.getItem('qa.seed')) {localStorage.setItem('qa.seed','true');localStorage.setItem('o.summaryView','false');localStorage.setItem('o.canvas',JSON.stringify({v:2,edge:'bezier',pulse:true,connectionAnimation:'aurora',hideConnectionLine:true}));}`);
  app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: join(dir, 'real-seed.cjs') }));
  realReady = new Promise(resolve => app.once('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => resolve(w))));
} else {
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  ipcMain.on('canvas:saveNow', (e, _id, value) => { canvas = value; e.returnValue = true; });
}
let win;
const errors = [];
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, label) {
  for (let i = 0; i < 100; i++) { if (await js(code)) { console.log('OK: ' + label); return; } await delay(80); }
  throw Error('Timeout: ' + label);
}
const box = id => js(`(()=>{const r=document.querySelector('[data-id="${id}"] .sun-orb, [data-id="${id}"] .summary-icon').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2}})()`);
async function mouse(type, x, y, extra = {}) {
  // Atualiza o alvo sob o cursor também depois de recarregar a página.
  if (type === 'mousePressed') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type:'mouseMoved', x, y, button:'none' });
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
}
async function drag(from, to, onStep) {
  await mouse('mouseMoved', from.x, from.y, { button: 'none' });
  await mouse('mousePressed', from.x, from.y, { buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', from.x + (to.x-from.x)*i/12, from.y+(to.y-from.y)*i/12, { buttons: 1 }); await delay(35); if (onStep) await onStep(); }
  await mouse('mouseReleased', to.x, to.y, { buttons: 0, clickCount: 1 }); await delay(350);
}
async function screenshot(name) { writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
let dialogDragChecked = false;
async function chooseCanvasOption(label, value) {
  const selector = JSON.stringify(`select[aria-label="${label}"]`);
  await js("document.querySelector('button[title=\"Configurações\"]').click()");
  if (realApp && !dialogDragChecked) {
    const rect = () => js("(()=>{const r=document.querySelector('.settings-dialog').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()");
    const original = await rect();
    await drag({x:original.x+100,y:original.y+24}, {x:original.x+190,y:original.y+69});
    const moved = await rect();
    assert.ok(Math.abs(moved.x-original.x-90)<2 && Math.abs(moved.y-original.y-45)<2, 'arrastar cabeçalho move as configurações');
    await screenshot('configuracoes-moveis');
    await drag({x:moved.x+100,y:moved.y+24}, {x:1,y:1});
    const limited = await rect();
    assert.ok(limited.x>=15 && limited.y>=15, 'configurações permanecem dentro da tela');
    await drag({x:limited.x+100,y:limited.y+24}, {x:limited.x+700,y:limited.y+500});
    const bottom = await rect();
    const viewport = await js('({width:innerWidth,height:innerHeight})');
    assert.ok(bottom.right<=viewport.width-15 && bottom.bottom<=viewport.height-15, 'limita também as bordas direita e inferior');
    const originalSize = win.getSize();
    win.setSize(1100, 800); await delay(250);
    const resized = await rect(), smaller = await js('({width:innerWidth,height:innerHeight})');
    assert.ok(resized.x>=15 && resized.y>=15 && resized.right<=smaller.width-15 && resized.bottom<=smaller.height-15, 'recoloca as configurações na tela ao reduzir a janela');
    win.setSize(...originalSize); await delay(250);
    const restored = await rect();
    await drag({x:restored.x+100,y:restored.y+24}, {x:original.x+100,y:original.y+24});
    dialogDragChecked = true;
    console.log('OK: mover configurações pelo cabeçalho e limitar à tela');
  }
  await js("[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.trim()==='Personalização').click()");
  await js(`(()=>{const select=document.querySelector(${selector});select.scrollIntoView({block:'center'});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await delay(100);
  assert.equal(await js(`document.querySelector(${selector}).value`), value);
  await js("document.querySelector('.settings-head button').click()");
  await delay(120);
}
const chooseLineStyle = edge => chooseCanvasOption('Estilo das linhas', edge);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Timeout: cenário de elementos redondos excedeu 150 segundos'); app.exit(1); }, 150_000);
  watchdog.unref();
  try {
    win = realApp ? await realReady : new BrowserWindow({ width: 1320, height: 1000, show: false, title: 'Zênite · Branch de elementos redondos', webPreferences: { preload: join(dir, 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false, webviewTag: true } });
    win.webContents.on('console-message', e => {
      // O Chromium pode adiar uma notificação de tamanho durante o zoom animado de abertura.
      if (e.message === 'ResizeObserver loop completed with undelivered notifications.') { console.log('INFO: redimensionamento adiado para o próximo quadro'); return; }
      if (e.level === 'error' && (realApp || !e.message.includes('No handler registered'))) errors.push(e.message);
    });
    if (!realApp) await win.loadFile(join(root, 'out/renderer/index.html'));
    win.showInactive();
    if (realApp) {
      await waitFor("document.querySelectorAll('.react-flow__node').length===7", 'Zênite real com serviços e cartões expandidos');
      // Sol salvo não concede autoridade: promove pela ponte da janela principal e recarrega.
      const sol = canvas.nodes.find(n => n.id === 'sol').terminal;
      assert.equal((await js(`window.o.pty.promoteSun(${JSON.stringify({ ...sol, sun: true, cols: 80, rows: 24 })})`)).ok, true);
      win.webContents.reload();
      await waitFor("!!document.querySelector('.sun-crown') && document.querySelectorAll('.react-flow__node').length===7", 'Sol promovido na sessão atual');
      await delay(900);
      await js(`document.querySelector('button[title^="Visão resumida"]').click()`);
      await delay(650);
    }
    await waitFor("document.querySelectorAll('.summary-node').length===7", 'elementos circulares na visão resumida');
    win.webContents.debugger.attach('1.3');
    if (realApp) await require('../fixtures/settings-personalization.scenario.cjs')({win,js,delay,screenshot});
    const c = await box('plano');
    assert.ok(await js(`!document.elementFromPoint(${c.x},${c.y}).closest('.react-flow__handle')`), 'centro livre para mover e abrir');
    assert.ok(await js(`!!document.elementFromPoint(${c.x+c.r-4},${c.y}).closest('.summary-link-ring')`), 'borda inicia conexão');
    await screenshot('01-circulos');
    const pathBefore = await js("document.querySelector('[data-id=\"sol-plano\"] .pulse-edge').getAttribute('d')");
    await drag(c, { x: c.x + 95, y: c.y + 100 });
    const moved = await box('plano');
    assert.ok(moved.x > c.x+80 && moved.y > c.y+80, 'arrastar centro move o elemento');
    assert.notEqual(await js("document.querySelector('[data-id=\"sol-plano\"] .pulse-edge').getAttribute('d')"), pathBefore, 'ligação acompanha a nova borda');
    const from = await box('nota'), to = await box('arquivo');
    await drag({ x: from.x, y: from.y-from.r+4 }, { x: to.x, y: to.y-to.r+4 });
    await waitFor("document.querySelectorAll('.react-flow__edge').length===7", 'criar ligação entre bordas superiores, sem entrada ou saída fixa');
    await delay(600);
    if (realApp) canvas = JSON.parse(readFileSync(join(profile, 'workspaces/qa.json'), 'utf8'));
    assert.ok(canvas.edges.some(e => e.source === 'nota' && e.target === 'arquivo'), 'nova ligação é salva');
    assert.equal(canvas.edges.find(e => e.id === 'rota').sourceHandle, 'rota-a', 'rota lógica original preservada');
    await screenshot('02-ligacao-nova');
    const p = await box('plano');
    await mouse('mousePressed', p.x, p.y, { buttons: 1, clickCount: 1 }); await mouse('mouseReleased', p.x, p.y, { buttons: 0, clickCount: 1 });
    await waitFor("!!document.querySelector('.summary-expanded-node .note-text, .summary-expanded-node .note-md')", 'clicar no centro abre o conteúdo');
    await js("document.querySelector('.summary-close').click()");
    await waitFor("document.querySelectorAll('.summary-node').length===7", 'voltar mantém os círculos e ligações');
    await delay(350);
    const tower = await box('torre');
    await mouse('mousePressed', tower.x, tower.y, { buttons:1, clickCount:1 });
    await mouse('mouseReleased', tower.x, tower.y, { buttons:0, clickCount:1 });
    await waitFor("!!document.querySelector('.summary-expanded-node .flow-outputs')", 'abrir astro com várias saídas');
    assert.ok(await js("!!document.querySelector('[data-id=\"rota\"] .pulse-edge')"), 'astro expandido mantém ligação na saída nomeada');
    await js("document.querySelector('.summary-close').click()");
    await waitFor("document.querySelectorAll('.summary-node').length===7", 'retornar do astro mantém as ligações');
    await delay(350);
    const endpointsOnCircles = `(() => {
      const edges=${JSON.stringify(canvas.edges)};
      return edges.every(e=>{
        const path=document.querySelector('[data-id="'+e.id+'"] .pulse-edge');
        return [[e.source,0],[e.target,path.getTotalLength()]].every(([id,d])=>{
          const orb=document.querySelector('[data-id="'+id+'"] .summary-icon, [data-id="'+id+'"] .sun-orb').getBoundingClientRect();
          const p=path.getPointAtLength(d), q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());
          return Math.abs(Math.hypot(q.x-orb.x-orb.width/2,q.y-orb.y-orb.height/2)-orb.width/2)<2;
        });
      });
    })()`;
    const styles = new Set();
    for (const edge of ['straight', 'bezier', 'smooth', 'step']) {
      await chooseLineStyle(edge);
      assert.ok(await js(endpointsOnCircles), edge + ': extremos de todas as conexões coincidem com as bordas circulares');
      const path = await js("document.querySelector('[data-id=\"sol-plano\"] .pulse-edge').getAttribute('d')");
      styles.add(path);
      if (edge === 'bezier') assert.match(path, /C/, 'Curva permanece curva entre círculos');
      if (edge === 'smooth') assert.match(path, /Q/, 'ângulos arredondados permanecem arredondados');
      if (edge === 'straight') assert.doesNotMatch(path, /[CQ]/, 'Reta permanece reta');
      await screenshot('estilo-' + edge);
    }
    assert.equal(styles.size, 4, 'os quatro estilos têm trajetos distintos na visão compacta');
    await chooseLineStyle('bezier');
    await delay(150);
    const effects = ['stardust','microcomets','plasma-pulse','orbital-system','warp','nebula','plasma-filaments','ion-stream','galactic-helix','resonance','star-shower','helical-orbit','aurora'];
    for (const effect of effects) {
      await chooseCanvasOption('Animação da ligação', effect);
      win.webContents.send('canvas:flow', 'sol', 'site');
      await delay(100);
      assert.equal(await js("document.querySelectorAll('g.connection-animation').length"), 7, effect + ': sete ligações vetoriais');
      assert.equal(await js("document.querySelectorAll('.react-flow__edges canvas,.react-flow__edges foreignObject').length"), 0, effect + ': sem rasterização');
      const shape = await js("document.querySelector('[data-id=\"sol-site\"] .connection-animation').innerHTML");
      await delay(100);
      assert.notEqual(await js("document.querySelector('[data-id=\"sol-site\"] .connection-animation').innerHTML"), shape, effect + ': formas em movimento');
      assert.ok(await js(endpointsOnCircles), effect + ': preserva os contatos com os círculos');
      if (['aurora','microcomets','galactic-helix'].includes(effect)) await screenshot('vetor-' + effect);
      win.webContents.send('canvas:flow', 'site', 'sol');
      await delay(80);
      console.log('OK: SVG no Zênite completo — ' + effect);
    }
    await js("document.querySelector('button[title=\"Enquadrar tudo\"]').click()");
    await delay(500);
    const clearSelectionAt = await js("(()=>{const r=document.querySelector('.react-flow').getBoundingClientRect();return{x:r.left+8,y:r.top+140}})()");
    for (const [i, id] of ['sol','plano','site','tabela','torre','arquivo','nota'].entries()) {
      console.log('Movendo círculo: ' + id);
      // O painel de constelação do selecionado pode cobrir outro círculo na parte inferior.
      await mouse('mousePressed', clearSelectionAt.x, clearSelectionAt.y, { buttons:1, clickCount:1 });
      await mouse('mouseReleased', clearSelectionAt.x, clearSelectionAt.y, { buttons:0, clickCount:1 });
      await delay(120);
      const at = await box(id);
      await drag(at, { x: at.x + (i % 2 ? 30 : -30), y: at.y + (i % 2 ? -25 : 25) }, async () => {
        assert.ok(await js(endpointsOnCircles), id + ': ligações acompanham durante o arraste');
      });
      assert.equal(await js("document.querySelectorAll('.summary-node').length"), 7, id + ': mover não abre o conteúdo');
      const after = await box(id);
      assert.ok(Math.hypot(after.x - at.x, after.y - at.y) > 20, id + ': o arraste realmente moveu o elemento');
    }
    await screenshot('04-todos-movidos');
    // Clique na área de interação de uma ligação, pelo mesmo canal de entrada da janela.
    const edgePoint = await js(`(()=>{const p=document.querySelector('[data-id="sol-site"] .react-flow__edge-interaction');const q=p.getPointAtLength(p.getTotalLength()/2),s=new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM());return {x:s.x,y:s.y}})()`);
    await mouse('mousePressed', edgePoint.x, edgePoint.y, { buttons: 1, clickCount: 1 });
    await mouse('mouseReleased', edgePoint.x, edgePoint.y, { buttons: 0, clickCount: 1 }); await delay(150);
    assert.ok(await js("!!document.querySelector('[data-id=\"sol-site\"].selected')"), 'clique seleciona ligação');
    assert.equal(await js("getComputedStyle(document.querySelector('[data-id=\"sol-site\"] .pulse-edge')).opacity"), '1', 'seleção mostra o traço de destaque');
    assert.ok(await js("!!document.querySelector('[data-id=\"sol-site\"] .connection-animation.emphasized')"), 'seleção realça a animação');
    await screenshot('05-ligacao-selecionada');
    // Os arrastes podem deixar o último círculo fora da tela: enquadra antes de selecionar tudo.
    await js("document.querySelector('button[title=\"Enquadrar tudo\"]').click()");
    await delay(500);
    await js("document.querySelector('button[title^=\"Selecionar:\"]').click()");
    const pane = await js("(()=>{const r=document.querySelector('.react-flow').getBoundingClientRect();return {x:r.x+8,y:r.y+135,right:r.right-75,bottom:r.bottom-110}})()");
    await drag({ x:pane.x,y:pane.y }, { x:pane.right,y:pane.bottom });
    const selected = await js("document.querySelectorAll('.react-flow__edge.selected').length");
    assert.equal(selected, canvas.edges.length, 'seleção por área inclui todas as ligações dos elementos');
    assert.ok(await js("[...document.querySelectorAll('.react-flow__edge.selected .pulse-edge')].every(p=>getComputedStyle(p).opacity==='1')"), 'seleção por área destaca todas as ligações selecionadas');
    await screenshot('06-selecao-por-area');
    const group = await box('plano');
    await drag(group, { x:group.x+15, y:group.y+15 }, async () => assert.ok(await js(endpointsOnCircles), 'ligações acompanham o arraste do grupo'));
    await screenshot('07-grupo-movido');
    // Desselecionar recolhe o destaque e respeita novamente a linha de base oculta.
    await mouse('mousePressed', pane.x+5, pane.bottom-5, { buttons:1, clickCount:1 });
    await mouse('mouseReleased', pane.x+5, pane.bottom-5, { buttons:0, clickCount:1 }); await delay(150);
    assert.equal(await js("document.querySelectorAll('.react-flow__edge.selected').length"), 0);
    assert.ok(await js("[...document.querySelectorAll('.pulse-edge')].every(p=>getComputedStyle(p).opacity==='0')"), 'destaque some ao desselecionar');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type:'mouseWheel', x:pane.x+150, y:pane.y+100, deltaX:0, deltaY:-100 });
    await delay(650);
    assert.ok(await js(endpointsOnCircles), 'zoom mantém os pontos de contato');
    await js("document.querySelector('button[title^=\"Mão:\"]').click()");
    await drag({x:pane.x+10,y:pane.y+120}, {x:pane.x+30,y:pane.y+140});
    await delay(650);
    assert.ok(await js(endpointsOnCircles), 'mover o canvas mantém os pontos de contato');
    assert.equal(await js("document.querySelectorAll('g.connection-animation').length"), 7, 'animações vetoriais retomam após zoom e pan');
    assert.equal(await js("document.querySelectorAll('.react-flow__edges canvas,.react-flow__edges foreignObject').length"), 0, 'ligações não usam imagens rasterizadas');
    await screenshot('03-final');
    assert.deepEqual(errors, []);
    console.log('OK: Zênite completo: mover todos e grupo, selecionar linha e área, preservar rotas e abrir/fechar conteúdo');
    if (process.argv.includes('--keep-open')) {
      if (process.argv.includes('--show-settings')) {
        await js("document.querySelector('button[title=\"Configurações\"]').click()");
        await js("[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.trim()==='Personalização').click()");
      }
      console.log('Janela mantida aberta para avaliação.'); return;
    }
    win.destroy(); app.quit();
  } catch(error) { console.error(error.stack); if(win) await screenshot('erro').catch(()=>{}); app.exit(1); }
});
if (realApp) require(join(root, 'out/main/index.js'));
