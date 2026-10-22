// Janela real do Zênite; perfil descartável e entrada de mouse limitada a esta janela.
const { app, BrowserWindow, session } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out/black-hole-qa');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(dir, 'profile-')), project = join(profile, 'project'), home = join(profile, 'home');
process.env.ZENITE_DATA_DIR = profile;
mkdirSync(join(home, '.agents/skills'), { recursive: true }); mkdirSync(project); mkdirSync(join(profile, 'workspaces')); mkdirSync(join(profile, 'notes'));
require('node:os').homedir = () => home;
const node = (id, kind, x, y, extra = {}) => ({ id, kind, x, y, width: 340, height: 240, summary: { x, y }, ...(kind === 'terminal' ? { terminal: { id, title: 'Terminal ativo', cwd: project, command: '' } } : { element: { id, kind, title: id, ...extra } }) });
const canvas = { version: 1, viewport: { x: 35, y: 100, zoom: 0.65 }, nodes: [node('agent', 'terminal', 30, 50), node('Plano', 'note', 550, 20), node('Revisão', 'note', 550, 380), node('Saída', 'note', 1100, 180)], edges: [{ id: 'entrada', source: 'agent', target: 'Plano' }, { id: 'interna', source: 'Plano', target: 'Revisão' }, { id: 'saida', source: 'Revisão', target: 'Saída' }] };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify({ version: 1, activeId: 'qa', workspaces: [{ id: 'qa', name: 'Buraco negro · validação', dir: project }], settings: { confirmQuit: false, agentGuide: false, agentPermissions: 'sandbox', notifyDone: false, notifyRequest: false } }));
writeFileSync(join(profile, 'workspaces/qa.json'), JSON.stringify(canvas));
writeFileSync(join(profile, 'notes/Plano.md'), 'Plano preservado');
const seed = join(dir, 'seed.cjs'); writeFileSync(seed, "if(!localStorage.getItem('qa.blackhole')){localStorage.setItem('qa.blackhole','1');localStorage.setItem('o.summaryView','false');}");
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
let win, hole;
const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code, true);
const state = () => JSON.parse(readFileSync(join(profile, 'workspaces/qa.json'), 'utf8'));
async function save() { await js("window.dispatchEvent(new Event('zenite:flush-canvas'))"); await delay(80); return state(); }
async function until(code, label) { for (let i = 0; i < 100; i++) { if (await js(`!!(${code})`)) { console.log('OK: ' + label); return; } await delay(80); } throw Error('Timeout: ' + label); }
const sel = (id, suffix = '') => `[data-testid="rf__node-${id}"]${suffix ? ' ' + suffix : ''}`;
async function click(selector) { await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Alvo ausente: '+${JSON.stringify(selector)});el.click()})()`); await delay(300); }
const box = selector => js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
async function mouse(type, p, extra = {}) { if (type === 'mousePressed') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type:'mouseMoved', ...p, button:'none' }); await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...p, button:'left', ...extra }); }
async function drag(selector, dx, dy) { const p = await box(selector); await mouse('mousePressed', p, { buttons:1, clickCount:1 }); for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', { x:p.x+dx*i/12, y:p.y+dy*i/12 }, { buttons:1 }); await delay(35); } await mouse('mouseReleased', { x:p.x+dx, y:p.y+dy }, { buttons:0, clickCount:1 }); await delay(400); }
async function dragInto(selector, target) {
  const from = await box(selector), to = await box(target);
  await mouse('mousePressed',from,{buttons:1,clickCount:1});
  for(let i=1;i<=20;i++){await mouse('mouseMoved',{x:from.x+(to.x-from.x)*i/20,y:from.y+(to.y-from.y)*i/20},{buttons:1});await delay(35);}
  assert.ok(await js("document.querySelector('.black-hole-receiving')"),'porta sinaliza que aceita os elementos');
  await shot('05-arraste-sobre-a-porta');
  await mouse('mouseReleased',to,{buttons:0,clickCount:1});await delay(400);
}
async function key(key, modifiers = []) { win.webContents.sendInputEvent({ type:'keyDown', keyCode:key, modifiers }); win.webContents.sendInputEvent({ type:'keyUp', keyCode:key, modifiers }); await delay(400); }
async function shot(name) { writeFileSync(join(dir, name+'.png'), (await win.webContents.capturePage()).toPNG()); }
async function organizeOpenFolder(mode) {
  const before=await save();
  const positions=s=>s.nodes.map(n=>({id:n.id,x:n.x,y:n.y,summary:n.summary}));
  for(let repeat=0;repeat<2;repeat++){
    await click('button[aria-label="Organizar todo o canvas"]');await delay(650);
    assert.ok(await js(`(()=>{const f=document.querySelector('.black-hole-folder').getBoundingClientRect();return ${JSON.stringify(before.nodes.find(n=>n.id===hole).element.blackHole.members)}.every(id=>{const r=document.querySelector('[data-testid="rf__node-'+id+'"]').getBoundingClientRect();return r.left>=f.left+1&&r.top>=f.top+35&&r.right<=f.right+1&&r.bottom<=f.bottom+1})})()`),'organizar mantém os membros dentro da pasta: '+mode);
    assert.deepEqual((await save()).edges,before.edges,'organizar preserva as ligações reais');
  }
  await shot('07-organizar-'+mode);
  // Uma segunda organização pode ser idêntica e, nesse caso, não gera outro passo.
  await key('z',['control']);
  if(JSON.stringify(positions(await save()))!==JSON.stringify(positions(before)))await key('z',['control']);
  assert.deepEqual(positions(await save()),positions(before),'desfazer recupera a disposição antes de organizar: '+mode);
}
const hidden = id => `getComputedStyle(document.querySelector(${JSON.stringify(sel(id))})).visibility==='hidden'`;
async function choose(names) {
  await click(sel(hole, '[aria-label="Escolher elementos do Buraco negro"]'));
  await until("document.querySelector('.black-hole-dialog')", 'editor de membros');
  await js(`(()=>{for(const label of document.querySelectorAll('.black-hole-choices label')){const input=label.querySelector('input'),wanted=${JSON.stringify(names)}.includes(label.querySelector('.black-hole-choice-text').firstChild.textContent);if(input.checked!==wanted)input.click()}})()`);
  assert.ok(await js(`(()=>{const l=document.querySelector('.black-hole-choices label'),r=l.getBoundingClientRect(),c=l.querySelector('input').getBoundingClientRect();return getComputedStyle(l).flexDirection==='row'&&r.height<100&&c.left>r.left+r.width/2})()`),'seletor tem linhas horizontais e checkbox à direita');
  await shot('00-organizar-pasta');
  await click('.black-hole-dialog button[type="submit"]'); await save();
}
const ready = new Promise(resolve => app.once('browser-window-created', (_e,w) => { w.webContents.on('console-message', e => { if(e.level==='error' && !e.message.includes('ResizeObserver'))errors.push(e.message); }); w.webContents.once('did-finish-load',()=>resolve(w)); }));
app.whenReady().then(async()=>{
  try {
    win=await ready; win.show(); win.webContents.debugger.attach('1.3');
    await until("document.querySelectorAll('.react-flow__node').length===4 && document.querySelector('.xterm')", 'Zênite real e terminal iniciado');
    const pty = await js("window.o.pty.create({id:'agent',cwd:"+JSON.stringify(project)+",command:'',cols:80,rows:24})");
    await click('button[title^="Astros:"]');
    await js("[...document.querySelectorAll('.dock-flow-menu button')].find(b=>b.textContent.includes('Buraco negro')).click()");
    await until("document.querySelector('.black-hole-node')", 'Buraco negro criado pelo menu');
    hole=(await save()).nodes.find(n=>n.kind==='blackhole').id;
    await drag(sel(hole,'.black-hole-orb'),-340,-10);
    await js('document.activeElement?.blur()'); await key('v');
    await dragInto(sel('Plano','.node-title'),sel(hole,'.black-hole-orb'));
    assert.deepEqual((await save()).nodes.find(n=>n.id===hole).element.blackHole.members,['Plano'],'arraste individual guarda o elemento');
    await key('z',['control']);
    assert.equal((await save()).nodes.find(n=>n.id===hole).element.blackHole.members.length,0,'desfazer devolve o elemento ao canvas');
    await click('button[title="Enquadrar tudo"]');await delay(500);
    await click('button[title^="Selecionar: arrastar"]');
    const area=await js(`(()=>{const a=document.querySelector(${JSON.stringify(sel('Plano'))}).getBoundingClientRect(),b=document.querySelector(${JSON.stringify(sel('Revisão'))}).getBoundingClientRect();return{x:a.left-12,y:a.top-12,right:a.right+12,bottom:b.bottom+12}})()`);
    await mouse('mousePressed',{x:area.x,y:area.y},{buttons:1,clickCount:1});
    for(let i=1;i<=12;i++){await mouse('mouseMoved',{x:area.x+(area.right-area.x)*i/12,y:area.y+(area.bottom-area.y)*i/12},{buttons:1});await delay(35);}
    await mouse('mouseReleased',{x:area.right,y:area.bottom},{buttons:0,clickCount:1});await delay(300);
    assert.equal(await js("document.querySelectorAll('.react-flow__node.selected:not([data-id=\""+hole+"\"])').length"),2,'V seleciona os dois elementos pela área');
    assert.equal(await js(`document.querySelector(${JSON.stringify(sel(hole))}).classList.contains('selected')`),false,'a porta fica fora da seleção');
    await dragInto('.react-flow__nodesselection-rect',sel(hole,'.black-hole-orb'));
    assert.deepEqual(new Set((await save()).nodes.find(n=>n.id===hole).element.blackHole.members),new Set(['Plano','Revisão']),'arrastar seleção guarda todos os elementos');
    await key('z',['control']);
    assert.equal((await save()).nodes.find(n=>n.id===hole).element.blackHole.members.length,0);
    await choose(['Plano','Revisão']);
    assert.equal(await js(hidden('Plano')),true); assert.equal(await js(hidden('Revisão')),true);
    assert.equal(await js("document.querySelectorAll('.react-flow__edge').length"),2);
    assert.deepEqual(state().edges,canvas.edges);
    assert.equal(await js(`document.querySelector(${JSON.stringify(sel(hole,'.black-hole-count'))}).textContent`),'2');
    await shot('01-recolhido');
    const before=await save(); await drag(sel(hole,'.black-hole-orb'),80,35); const moved=await save();
    const a=before.nodes.find(n=>n.id===hole), b=moved.nodes.find(n=>n.id===hole), dx=b.x-a.x, dy=b.y-a.y;
    assert.ok(Math.hypot(dx,dy)>50,'agrupador realmente move');
    for(const id of ['Plano','Revisão']) { const old=before.nodes.find(n=>n.id===id),now=moved.nodes.find(n=>n.id===id); assert.ok(Math.abs(now.x-old.x-dx)<1 && Math.abs(now.y-old.y-dy)<1,'membro acompanha o grupo'); }
    const closedViewport=(await save()).viewport;
    await click(sel(hole,'.black-hole-orb')); await until(`!(${hidden('Plano')})`, 'clicar na porta abre a pasta');await delay(650);
    assert.equal(await js("document.querySelectorAll('.react-flow__edge').length"),5);
    assert.ok(await js("document.querySelector('.black-hole-folder')"),'pasta aberta no próprio canvas');
    assert.notDeepEqual((await save()).viewport,closedViewport,'abrir enquadra a pasta com zoom');
    assert.ok(await js(`(()=>{const frame=document.querySelector('.black-hole-folder').getBoundingClientRect();return ${JSON.stringify(['Plano','Revisão'])}.every(id=>{const r=document.querySelector('[data-testid="rf__node-'+id+'"]').getBoundingClientRect();return r.left>=frame.left&&r.top>=frame.top&&r.right<=frame.right+1&&r.bottom<=frame.bottom+1})})()`),'elementos ficam dentro da superfície da pasta');
    assert.equal(await js(`document.querySelector(${JSON.stringify(sel('Plano','.note-text'))}).value`),'Plano preservado');
    await shot('02-aberto');
    await organizeOpenFolder('normal');
    const memberBefore=await save(), memberScreenBefore=await box(sel('Plano','.node-title')), pathBefore=await js("document.querySelector('[data-id=\"entrada::black-hole-target\"] .pulse-edge').getAttribute('d')");
    await drag(sel('Plano','.node-title'),30,20);const memberAfter=await save();
    const memberDx=memberAfter.nodes.find(n=>n.id==='Plano').x-memberBefore.nodes.find(n=>n.id==='Plano').x;
    const memberScreenAfter=await box(sel('Plano','.node-title'));
    assert.ok(memberDx>20&&Math.abs(memberDx*memberBefore.viewport.zoom-(memberScreenAfter.x-memberScreenBefore.x))<1,'arrastar dentro da pasta conserva a posição entre o canvas e a tela');
    assert.notEqual(await js("document.querySelector('[data-id=\"entrada::black-hole-target\"] .pulse-edge').getAttribute('d')"),pathBefore,'linha acompanha o elemento dentro da pasta');
    await key('z',['control']);
    await js("document.querySelector('[data-id=\"entrada::black-hole-target\"] .pulse-edge').dispatchEvent(new MouseEvent('click',{bubbles:true}))");await delay(200);
    assert.equal(await js("document.querySelectorAll('.react-flow__edge.selected[data-id^=\"entrada\"]').length"),2,'selecionar um trecho destaca a ligação inteira');
    await click('button[title="Enquadrar tudo"]');await delay(400);
    await dragInto(sel('Saída','.node-title'),sel(hole,'.black-hole-orb'));
    assert.equal((await save()).nodes.find(n=>n.id===hole).element.blackHole.members.length,3,'a pasta aberta também aceita elementos');
    assert.ok(await js(`(()=>{const f=document.querySelector('.black-hole-folder').getBoundingClientRect(),r=document.querySelector(${JSON.stringify(sel('Saída'))}).getBoundingClientRect();return r.left>=f.left&&r.top>=f.top&&r.right<=f.right+1&&r.bottom<=f.bottom+1})()`),'novo elemento é acomodado dentro da pasta aberta');
    await key('z',['control']);
    await click('.summary-close-panel .summary-close'); await delay(400);
    const restoredViewport=(await save()).viewport;
    assert.ok(Math.abs(restoredViewport.zoom-closedViewport.zoom)<0.01,'voltar restaura o zoom anterior');
    await choose(['Plano','Revisão','Terminal ativo']);
    assert.equal(await js(hidden('agent')),true);
    const samePty=await js("window.o.pty.create({id:'agent',cwd:"+JSON.stringify(project)+",command:'',cols:80,rows:24})");
    assert.equal(pty.reused,true); assert.equal(samePty.reused,true,'recolher conserva a sessão PTY existente');
    await click('button[title^="Visão resumida"]'); await delay(650);
    const compactBefore=await save(); await drag(sel(hole,'.black-hole-orb'),-60,25); const compactAfter=await save();
    const g1=compactBefore.nodes.find(n=>n.id===hole),g2=compactAfter.nodes.find(n=>n.id===hole);
    const groupFrom=g1.summary??g1,groupTo=g2.summary??g2;
    assert.ok(Math.abs(groupTo.x-groupFrom.x)>20);
    for(const id of ['Plano','Revisão','agent']) { const old=compactBefore.nodes.find(n=>n.id===id),now=compactAfter.nodes.find(n=>n.id===id); assert.ok(Math.abs(now.summary.x-old.summary.x-(groupTo.x-groupFrom.x))<1); assert.equal(now.x,old.x); }
    await click(sel(hole,'.black-hole-actions .ghost')); await until("document.querySelectorAll('.summary-node').length===4", 'abrir no modo compacto');
    await delay(650);await organizeOpenFolder('compacto');await click(sel('Plano','.summary-icon'));await delay(500);
    assert.ok(await js(`(()=>{const n=document.querySelector(${JSON.stringify(sel('Plano'))}).getBoundingClientRect(),p=document.querySelector('.react-flow').getBoundingClientRect();return document.querySelector(${JSON.stringify(sel('Plano'))}).classList.contains('summary-expanded-node')&&Math.abs(n.x+n.width/2-p.x-p.width/2)<40&&Math.abs(n.y+n.height/2-p.y-p.height/2)<40})()`),'abrir um membro compacto focaliza o conteúdo dentro da pasta');
    await click('.summary-close-panel .summary-close');await delay(350);
    await click(sel(hole,'.black-hole-actions .ghost')); await save(); win.webContents.reload();
    await until("document.querySelector('.black-hole-node') && document.querySelectorAll('.summary-node').length===4", 'grupo e aplicações reabertos');
    assert.equal(await js(hidden('Plano')),true); assert.deepEqual(state().edges,canvas.edges);
    await until("document.querySelectorAll('.react-flow__edge').length===1",'ligação externa aparece no grupo compacto');
    assert.ok(await js(`(()=>{const p=document.querySelector('[data-id="saida"] .pulse-edge'),q=p.getPointAtLength(0),point=new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM()),r=document.querySelector(${JSON.stringify(sel(hole,'.black-hole-horizon'))}).getBoundingClientRect();return Math.abs(Math.hypot(point.x-r.x-r.width/2,point.y-r.y-r.height/2)-r.width/2)<3})()`),'linha encosta no horizonte visível do Buraco negro');
    await shot('03-compacto-persistido');
    await dragInto(sel('Saída','.summary-icon'),sel(hole,'.black-hole-orb'));
    assert.equal((await save()).nodes.find(n=>n.id===hole).element.blackHole.members.length,4,'arraste no modo compacto guarda o elemento');
    await key('z',['control']);
    await click(sel(hole,'[aria-label="Desagrupar Buraco negro"]'));
    await until("!document.querySelector('.black-hole-node')", 'desagrupar remove só o agrupador');
    assert.equal((await save()).nodes.length,4); assert.equal(await js(hidden('Plano')),false);
    await key('z',['control']); await until("document.querySelector('.black-hole-node')", 'desfazer restaura o grupo');
    assert.equal(await js(hidden('Plano')),true); assert.deepEqual((await save()).edges,canvas.edges);
    const groupCenter=await box(sel(hole,'.black-hole-title'));
    await mouse('mousePressed',groupCenter,{buttons:1,clickCount:1});await mouse('mouseReleased',groupCenter,{buttons:0,clickCount:1});
    await key('c',['control']);await key('v',['control']);
    await until("document.querySelectorAll('.black-hole-node').length===2",'copiar e colar leva o grupo e o conteúdo');
    const pasted=await save(),copy=pasted.nodes.find(n=>n.kind==='blackhole'&&n.id!==hole);
    assert.equal(copy.element.blackHole.members.length,3);
    assert.ok(copy.element.blackHole.members.every(id=>pasted.nodes.some(n=>n.id===id)&&!['agent','Plano','Revisão'].includes(id)));
    assert.ok(!copy.summary || Math.hypot(copy.summary.x-(pasted.nodes.find(n=>n.id===hole).summary?.x??0),copy.summary.y-(pasted.nodes.find(n=>n.id===hole).summary?.y??0))>20,'cópia não se sobrepõe ao agrupador original');
    assert.equal(pasted.edges.length,5,'cópia leva as conexões internas e mantém as originais');
    for(const id of [hole,copy.id])await click(sel(id,'.black-hole-actions .ghost'));
    await js("document.activeElement?.blur()");await key('a',['control']);
    await click('button[aria-label="Guardar seleção em Buraco negro"]');
    await until("document.querySelectorAll('.black-hole-node').length===3",'seleção cria um novo Buraco negro');
    const grouped=await save(),newGroup=grouped.nodes.find(n=>n.kind==='blackhole'&&![hole,copy.id].includes(n.id));
    assert.equal(newGroup.element.blackHole.members.length,7,'seleção inclui apenas os elementos, sem aninhar agrupadores');
    assert.equal(grouped.nodes.find(n=>n.id===hole).element.blackHole.members.length,0,'transferência retira membros do grupo anterior');
    await key('z',['control']);await until("document.querySelectorAll('.black-hole-node').length===2",'desfazer agrupamento restaura os grupos anteriores');
    assert.equal((await save()).nodes.find(n=>n.id===hole).element.blackHole.members.length,3);
    for(const id of [hole,copy.id])await click(sel(id,'.black-hole-actions .ghost'));
    await click('button[title="Enquadrar tudo"]'); await delay(400); await shot('04-final');
    assert.deepEqual(errors,[]);
    writeFileSync(join(dir,'resultado.json'),JSON.stringify({ok:true,profile,checks:['criar','configurar','recolher','expandir','mover','conexões','PTY preservado','compacto','persistência','desagrupar','desfazer','copiar e colar','agrupar seleção','transferir membros','arraste individual','seleção V e arraste conjunto','destaque da porta','pasta aberta recebe elementos','arraste compacto','zoom e retorno','movimento dentro da pasta','seleção dos trechos da ligação'],errors},null,2));
    console.log('PASS: Buraco negro validado no Zênite real');
    if(process.argv.includes('--keep-open')){await click(sel(hole,'.black-hole-orb'));await delay(650);await shot('06-demonstracao');return;}
    await save();await delay(650);win.destroy();app.quit();
  }catch(error){console.error(error.stack);if(win){console.log(await js("JSON.stringify([...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,style:n.getAttribute('style'),handles:[...n.querySelectorAll('.react-flow__handle')].map(h=>h.outerHTML)})))").catch(()=>''));await shot('erro').catch(()=>{});}app.exit(1);}
});
require(join(root,'out/main/index.js'));
