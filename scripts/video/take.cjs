// Automação exclusiva do WebContents do projeto fictício: não usa o mouse/foco do PC.
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
module.exports = async ({ win, out, profile, project, api }) => {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = code => win.webContents.executeJavaScript(code, true);
  const command = name => js(`window.dispatchEvent(new CustomEvent('zenite:command',{detail:${JSON.stringify(name)}}))`);
  const click = selector => js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Controle ausente: '+${JSON.stringify(selector)});e.click()})()`);
  const wait = async (code, label, limit = 15000) => { const end = Date.now() + limit; while (Date.now() < end) { if (await js(code)) return; await delay(200); } throw Error('Espera excedida: ' + label); };
  const shot = name => fetch(api() + '/shot?name=' + name).then(r => r.json());
  const start = async name => { const r=await fetch(api() + '/start?name=' + name).then(r => r.json()); if(!r.ok)throw Error('Gravação '+name+': '+r.error); };
  const stop = async () => { const info = await fetch(api() + '/stop').then(r => r.json()); console.log('TAKE ' + JSON.stringify(info)); };
  const go = async id => { const order={studio:0,elements:1,draw:2,multiverse:3,flows:4,agents:5}; await js(`document.querySelectorAll('.workspace-item')[${order[id]}].click()`); await delay(2000); };
  const fill = async (selector, value) => js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Campo ausente');const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const setting = async (label, value) => {
    await command('open-settings'); await delay(350);
    await js(`[...document.querySelectorAll('.settings-tabs button')].find(e=>e.textContent.trim()==='Personalização').click()`); await delay(250);
    await fill(`[aria-label="${label}"]`, value); await delay(400); await click('.settings-head button'); await delay(350);
  };
  const evidence = [];
  await delay(2300);
  await command('select-tool:hand').catch(() => {});
  await start('canvas'); await delay(4500);
  await command('toggle-summary'); await delay(3000); await shot('canvas-resumido');
  await command('toggle-summary'); await delay(2500); await command('fit-view'); await delay(2500); await shot('canvas'); await stop();
  evidence.push('Canvas real com processos locais e leitura autenticada de nota.');
  await start('connections');
  for (const effect of ['aurora', 'microcomets', 'galactic-helix']) {
    await setting('Animação da ligação', effect); await delay(5000); await shot('efeito-' + effect);
  }
  await stop(); evidence.push('Três efeitos de conexão configurados pela interface.');
  await go('elements'); await wait("document.querySelector('[data-id=\"site\"] webview')", 'site');
  await start('elements'); await delay(3500);
  // O clique é enviado somente ao WebContents do protótipo local embutido.
  const guest = await js("document.querySelector('[data-id=\"site\"] webview').getWebContentsId()");
  const wc = require('electron').webContents.fromId(guest);
  await wc.executeJavaScript("document.querySelector('button').click()"); await delay(2500);
  await shot('elementos-prototipo');
  await click('[data-id="contexto"] button[title="Editar o texto"]'); await delay(500);
  await fill('[data-id="contexto"] textarea', '# Aurora / lançamento\n\nBriefing atualizado no canvas.\n\n- Interface navegável\n- Requisitos organizados\n- Próximo passo: testar uma nova versão\n\n**Contexto e resultado lado a lado.**'); await delay(700);
  await click('[data-id="contexto"] button[title="Ver formatado (Markdown)"]'); await delay(2500); await shot('elementos'); await stop();
  evidence.push('Protótipo local clicado e nota editada pela interface real.');
  await go('draw'); await start('draw'); await delay(2000);
  // CDP direciona os traços para o canvas, sem mover o cursor do sistema.
  win.webContents.debugger.attach('1.3');
  await click('.draw-toolbar button[title="Elipse (O)"]'); await delay(300);
  const points = { from: { x: 1170, y: 350 }, to: { x: 1440, y: 510 } };
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from, button: 'none' });
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 24; i++) { await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + (points.to.x - points.from.x) * i / 24, y: points.from.y + (points.to.y - points.from.y) * i / 24, button: 'left', buttons: 1 }); await delay(30); }
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', buttons: 0, clickCount: 1 });
  await delay(2000); await click('.draw-toolbar button[title="Seta (A)"]'); await delay(300);
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1040, y: 420, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 20; i++) { await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1040 + i * 6, y: 420, button: 'left', buttons: 1 }); await delay(30); }
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1160, y: 420, button: 'left', buttons: 0, clickCount: 1 });
  win.webContents.debugger.detach(); await delay(2000); await shot('draw'); await stop();
  evidence.push('Elipse e seta desenhadas no canvas por eventos de entrada isolados à janela.');
  await go('multiverse'); await start('universes');
  await command('new-universe'); await wait("document.querySelector('.dialog-form input[placeholder=\"ex.: Novo checkout\"]')", 'diálogo do universo');
  await fill('.dialog-form input[placeholder="ex.: Novo checkout"]', 'Nova interface'); await delay(2200); await shot('universo-criar');
  await click('.dialog-form button[type="submit"]'); await delay(5000);
  const index = await js('window.o.workspaces.list()'); const universe = index.workspaces.find(w => w.id === 'multiverse').universes[0];
  if (!universe?.isolated) throw Error('Universo não foi criado como cópia Git');
  writeFileSync(join(universe.path, 'interface.txt'), 'Projeto Aurora — nova interface\n\nBriefing, requisitos e validação conectados.\n');
  const status = await js(`window.o.universes.status('multiverse',${JSON.stringify(universe.id)})`);
  writeFileSync(join(out, 'universe-evidence.json'), JSON.stringify({ universe: universe.name, isolated: universe.isolated, status }, null, 2));
  await delay(1700);
  await js("[...document.querySelectorAll('.universe-action')].find(e=>e.title.includes('leva as mudanças')).click()");
  await delay(2000); await shot('universo-revisao'); await delay(3000);
  await js("[...document.querySelectorAll('.dialog-actions button')].find(e=>e.textContent.trim()==='Cancelar').click()");
  await delay(1200); await stop(); evidence.push('Universo Git real criado; mudança em interface.txt na cópia; revisão aberta sem alterar a Origem.');
  await go('flows'); await start('flows'); await delay(1800);
  await click('[data-id="inicio"] button[title="Executar a partir daqui"]'); await delay(6500); await shot('fluxo-resultado'); await delay(2500); await stop();
  evidence.push('Fluxo manual executado pela interface. Conferir o resultado da nota no perfil.');
  writeFileSync(join(out, 'evidence.json'), JSON.stringify({ captured: new Date().toISOString(), evidence }, null, 2));
  console.log('TAKES COMPLETE');
};
