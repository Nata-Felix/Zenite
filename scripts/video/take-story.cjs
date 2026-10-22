// Grava uma história do comercial: promove o terminal a Sol pela interface, dá a largada
// e acompanha a coreografia (sol-show.cjs). No meio, abre o menu de astros e passa por
// cada opção, para a câmera da edição aproximar.
const { existsSync } = require('node:fs');
const { join } = require('node:path');
module.exports = async ({ win, api, project }) => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const js = code => win.webContents.executeJavaScript(code, true);
  const endpoint = async path => { const r = await fetch(api() + path).then(r => r.json()); if (r.error) throw Error(r.error); return r; };
  const until = async (file, limit = 120000) => { const end = Date.now() + limit; while (!existsSync(join(project, file))) { if (Date.now() > end) throw Error('Esperou demais: ' + file); await delay(200); } };
  const paint = setInterval(() => win.webContents.invalidate(), 40);
  win.webContents.debugger.attach('1.3');
  const input = (type, p, extra = {}) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1, ...extra });
  const click = async p => { await input('mousePressed', p, { buttons: 1 }); await input('mouseReleased', p, { buttons: 0 }); };
  const center = selector => js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  try {
    await delay(4000);
    const header = await js("(()=>{const r=document.querySelector('[data-id=\"sol\"] .terminal-header').getBoundingClientRect();return{x:r.x+35,y:r.y+10}})()");
    await click(header); await delay(300);
    await js("document.querySelector('button[title^=\"Promover a Sol\"]').click()"); await delay(600);
    // Clique num canto vazio do canvas tira a seleção e a barra de opções do Sol.
    const empty = await js("(()=>{const r=document.querySelector('.react-flow__pane').getBoundingClientRect();return{x:r.right-260,y:r.top+140}})()");
    await click(empty); await delay(1200);
    await js("window.dispatchEvent(new CustomEvent('zenite:command',{detail:'toggle-sidebar'}))"); await delay(900);
    await endpoint('/start?name=story-' + process.env.ZENITE_FILM_STORY);
    await delay(1200);
    require('node:fs').writeFileSync(join(project, '.go'), '1');
    if (process.env.ZENITE_FILM_STORY === 'bugs') {
    await until('.menu');
    const button = await center('.dock-agent[aria-haspopup="menu"]');
    await click(button); await delay(900);
    const items = await js("[...document.querySelectorAll('[role=menu] [role=menuitem], [role=menu] button')].slice(0,12).map(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})");
    for (const p of items) { await input('mouseMoved', p, { buttons: 0 }); await delay(260); }
    await delay(500);
    for (let i = 0; i < 3 && await js("document.querySelector('.dock-agent[aria-haspopup=\"menu\"]').getAttribute('aria-expanded')==='true'"); i++) {
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await delay(300);
      if (await js("document.querySelector('.dock-agent[aria-haspopup=\"menu\"]').getAttribute('aria-expanded')==='true'")) { await click(empty); await delay(300); }
    }
    require('node:fs').writeFileSync(join(project, '.menu-done'), '1');
    }
    await until('.sol-done');
    await delay(6000);
    console.log('STORY TAKE ' + JSON.stringify(await endpoint('/stop')));
  } catch (error) {
    // Diagnóstico: o que cada terminal mostrava quando a coreografia parou.
    const screens = await js(`[...document.querySelectorAll('[data-id]')].filter(n => n.querySelector('.xterm-rows')).map(n => '== ' + n.dataset.id + '\n' + [...n.querySelectorAll('.xterm-rows > div')].map(r => r.textContent).join('\n')).join('\n\n')`).catch(e => 'dump falhou: ' + e.message);
    require('node:fs').writeFileSync(join(project, '..', '..', 'story-debug.txt'), screens);
    await fetch(api() + '/stop').catch(() => {});
    require('node:fs').writeFileSync(join(project, '..', '..', 'story-error.txt'), error.stack);
    throw error;
  } finally { clearInterval(paint); win.webContents.debugger.detach(); }
  await fetch(api() + '/quit');
};
