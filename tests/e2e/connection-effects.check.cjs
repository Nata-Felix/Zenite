// Componentes reais em uma janela isolada: nenhum controle global de mouse ou teclado.
const { app, BrowserWindow } = require('electron');
const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync, readdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = process.cwd(), dir = join(root, 'out', 'connection-effects-qa');
mkdirSync(dir, { recursive: true });
app.setPath('userData', mkdtempSync(join(dir, 'profile-')));
const css = readdirSync(join(root, 'out/renderer/assets')).find((file) => file.endsWith('.css'));
buildSync({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow} from '@xyflow/react';
import {PulseEdge,setCanvasMoving} from './src/renderer/components/PulseEdge';
import {ConnectionEffects} from './src/renderer/components/settings/ConnectionEffects';
import {canvasPrefs,setCanvasPrefs} from './src/renderer/canvasPrefs';
import {recordFlow,flowState} from './src/renderer/flowBus';
import {CONNECTION_EFFECTS} from './src/renderer/connectionEffects';
import '@xyflow/react/dist/style.css';
window.qa={canvasPrefs,setCanvasPrefs,setCanvasMoving,recordFlow,flowState,effects:CONNECTION_EFFECTS};
const nodes=[{id:'a',position:{x:50,y:70},data:{label:'Astro A'},sourcePosition:'right'}, {id:'b',position:{x:360,y:300},data:{label:'Elemento B'},targetPosition:'left'}];
createRoot(document.getElementById('root')).render(<div style={{display:'flex',height:'100vh'}}>
 <div style={{flex:1}}><ReactFlow nodes={nodes} defaultEdges={[{id:'ab',source:'a',target:'b',type:'pulse'}]} edgeTypes={{pulse:PulseEdge}} fitView /></div>
 <aside style={{width:580,padding:24,overflowY:'auto',background:'var(--panel)'}}><h2>Canvas · Ligações</h2><ConnectionEffects/></aside>
</div>);
`, resolveDir: root, loader: 'jsx' }, bundle: true, platform: 'browser', format: 'iife', outfile: join(dir, 'qa.js'), logLevel: 'silent' });
writeFileSync(join(dir, 'index.html'), `<html><meta charset="utf-8"><link rel="stylesheet" href="../renderer/assets/${css}"><link rel="stylesheet" href="qa.css"><div id="root"></div><script src="qa.js"></script></html>`);
let win;
const errors = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
const select = async (id) => {
  await js(`(()=>{const e=document.querySelector('select[aria-label="Animação da ligação"]');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await delay(200);
};
async function screenshot(name) { writeFileSync(join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1280, height: 860, show: false, title: 'Zênite · Teste das animações de ligação', webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
    await win.loadFile(join(dir, 'index.html'));
    win.showInactive();
    await delay(800);
    assert.equal(await js("document.querySelector('select').options.length"), 14);
    assert.equal(await js('qa.canvasPrefs().connectionAnimation'), 'classic');
    assert.equal(await js('qa.canvasPrefs().hideConnectionLine'), false);
    assert.equal(await js("document.querySelector('[aria-label=\"Ocultar linha de base\"]')"), null);
    const effects = await js('qa.effects.map(e=>e.id)');
    for (const effect of effects) {
      await select(effect);
      await js("document.querySelector('.connection-preview-actions button').click();qa.recordFlow('a','b')");
      await delay(180);
      assert.equal(await js('qa.canvasPrefs().connectionAnimation'), effect);
      assert.equal(await js("document.querySelectorAll('canvas,foreignObject').length"), 0, effect + ': nenhum bitmap');
      assert.equal(await js("document.querySelectorAll('g.connection-animation').length"), 2, effect + ': prévia e ligação vetoriais');
      assert.ok(await js("[...document.querySelectorAll('g.connection-animation')].every(g=>g.children.length>0 && g.getBBox().width>0)"), effect + ': formas vetoriais visíveis');
      const before = await js("document.querySelector('.react-flow .connection-animation').innerHTML");
      await delay(150);
      assert.notEqual(await js("document.querySelector('.react-flow .connection-animation').innerHTML"), before, effect + ': vetores se movem');
      await js("document.querySelectorAll('.connection-preview-actions button')[1].click();qa.recordFlow('b','a')");
      await delay(120);
      assert.equal(await js("qa.flowState('a','b')"), 'reverse beat');
      assert.match(await js("document.querySelector('.connection-preview-state').textContent"), /←/);
      if (['microcomets', 'aurora', 'galactic-helix'].includes(effect)) await screenshot(effect);
      console.log('OK: ' + effect + ' — prévia, ligação e dois sentidos');
    }
    await js("document.querySelector('[aria-label=\"Ocultar linha de base\"]').click()");
    await delay(120);
    assert.equal(await js("getComputedStyle(document.querySelector('.pulse-edge')).opacity"), '0', 'oculta a linha real');
    assert.equal(await js("getComputedStyle(document.querySelector('.connection-preview-path')).opacity"), '0', 'oculta a linha na prévia');
    assert.equal(await js("document.querySelectorAll('g.connection-animation').length"), 2, 'mantém os efeitos');
    const point = await js(`(()=>{const p=document.querySelector('.react-flow__edge-interaction');const q=p.getPointAtLength(p.getTotalLength()/2);const s=new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM());return {x:Math.round(s.x),y:Math.round(s.y)}})()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await delay(150);
    assert.ok(await js("!!document.querySelector('.react-flow__edge.selected')"), 'ligação oculta continua selecionável');
    assert.equal(await js("getComputedStyle(document.querySelector('.pulse-edge')).opacity"), '1', 'seleção destaca a linha mesmo com base oculta');
    assert.ok(await js("!!document.querySelector('.connection-animation.emphasized')"), 'seleção também realça o efeito');
    await screenshot('somente-efeito');
    await select('classic');
    assert.equal(await js("getComputedStyle(document.querySelector('.pulse-edge')).opacity"), '1', 'clássica mantém a linha');
    await select('aurora');
    await js("document.querySelector('.react-flow__pane').dispatchEvent(new MouseEvent('click',{bubbles:true}))"); await delay(100);
    assert.equal(await js("getComputedStyle(document.querySelector('.pulse-edge')).opacity"), '0', 'lembra a escolha ao voltar ao efeito');
    for (const edge of ['straight', 'step', 'smooth', 'bezier']) {
      await js(`qa.setCanvasPrefs({edge:${JSON.stringify(edge)}})`); await delay(100);
      assert.equal(await js("document.querySelectorAll('.react-flow .connection-animation').length"), 1);
    }
    await js(`(() => {
      const set = (label,value) => { const e=document.querySelector('input[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true})); };
      set('Cor da animação','#ff8844');
    })()`);
    await delay(100);
    assert.equal(await js('qa.canvasPrefs().connectionEffect.color'), '#ff8844', 'controle de cor aplica a preferência');
    await js(`(() => {const e=document.querySelector('input[aria-label="Velocidade de transmissão"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2.3');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await delay(100);
    await js(`(() => {const e=document.querySelector('input[aria-label="Velocidade em repouso"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'0');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await delay(100);
    await win.loadFile(join(dir, 'index.html')); await delay(500);
    assert.deepEqual(await js('qa.canvasPrefs().connectionEffect'), { color: '#ff8844', activeSpeed: 2.3, idleSpeed: 0 });
    assert.equal(await js('qa.canvasPrefs().connectionAnimation'), 'aurora');
    assert.equal(await js('qa.canvasPrefs().hideConnectionLine'), true, 'persistência da linha oculta');
    assert.equal(await js("document.querySelector('[aria-label=\"Ocultar linha de base\"]').getAttribute('aria-checked')"), 'true');
    await js("document.querySelector('[aria-label=\"Ocultar linha de base\"]').click()"); await delay(100);
    assert.equal(await js("getComputedStyle(document.querySelector('.pulse-edge')).opacity"), '1', 'permite reexibir a linha');
    await js('qa.setCanvasMoving(true)'); await delay(100);
    assert.equal(await js("document.querySelectorAll('.react-flow .connection-animation').length"), 0);
    await js('qa.setCanvasMoving(false)'); await delay(100);
    assert.equal(await js("document.querySelectorAll('.react-flow .connection-animation').length"), 1);
    await win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await delay(150);
    assert.equal(await js("document.querySelectorAll('.connection-animation,animateMotion').length"), 0);
    assert.match(await js("document.querySelector('.connection-preview-state').textContent"), /Movimento reduzido/);
    await select('classic');
    assert.equal(await js("document.querySelectorAll('.connection-animation,animateMotion').length"), 0);
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await select('aurora');
    await js("qa.setCanvasPrefs({connectionEffect:{color:'',activeSpeed:1,idleSpeed:1},pulse:false});qa.recordFlow('b','a')");
    await delay(150);
    assert.equal(await js("document.querySelectorAll('.react-flow .connection-animation').length"), 1, 'pulso desligado ainda indica envios');
    await delay(2800);
    assert.equal(await js("document.querySelectorAll('.react-flow .connection-animation').length"), 0, 'sem envio e sem repouso não anima');
    await js('qa.setCanvasPrefs({pulse:true})'); await delay(150);
    assert.equal(await js("qa.flowState('a','b')"), 'reverse', 'sentido retido após o envio');
    await screenshot('configuracoes');
    assert.deepEqual(errors, []);
    console.log('OK: persistência, quatro curvas, pausa ao mover, movimento reduzido e repouso');
    win.destroy(); app.quit();
  } catch (error) {
    console.error(error.stack);
    if (win && !win.isDestroyed()) await screenshot('erro').catch(() => {});
    app.exit(1);
  }
});
