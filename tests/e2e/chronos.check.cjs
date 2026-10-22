// Motor e interface reais; dados descartáveis, sem agentes ou serviços externos.
const {app,session}=require('electron');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const root=process.cwd(),dir=join(root,'out/chronos-qa');mkdirSync(dir,{recursive:true});
const profile=mkdtempSync(join(dir,'profile-'));process.env.ZENITE_DATA_DIR=profile;
const home=join(profile,'home');mkdirSync(join(home,'.agents/skills'),{recursive:true});require('node:os').homedir=()=>home;
mkdirSync(join(profile,'workspaces'));
const node=(id,spec,x=0,y=0)=>({id,kind:'flow',x,y,width:280,height:165,element:{id,kind:'flow',title:id,flow:spec}});
const workspaces=[];
for(let i=0;i<5;i++){
  const id='g'+i;workspaces.push({id,name:'Cronos · galáxia '+i,dir:profile});
  const nodes=[node(id+'-inicio',{type:'chronos',chronos:{mode:'startup'}},0,0),node(id+'-intervalo',{type:'chronos',chronos:{mode:'interval',value:2,unit:'seconds'}},350,0)];
  if(i===0)nodes.push(node('Cronos',{type:'chronos',chronos:{mode:'delay',value:10,unit:'seconds',output:'{{entrada}}:{{continue}}'}},0,280),node('Ignição',{type:'ignition',schedule:'manual'},350,280),node('Espera antiga',{type:'wait',waitSeconds:5},700,280));
  writeFileSync(join(profile,'workspaces',id+'.json'),JSON.stringify({version:1,viewport:{x:70,y:130,zoom:0.7},nodes,edges:[]}));
}
writeFileSync(join(profile,'workspaces/index.json'),JSON.stringify({version:1,activeId:'g0',workspaces,settings:{confirmQuit:false,agentGuide:false,agentPermissions:'sandbox',notifyDone:false,notifyRequest:false}}));
const seed=join(dir,'seed.cjs');writeFileSync(seed,"localStorage.setItem('o.summaryView','false')");
app.whenReady().then(()=>session.defaultSession.registerPreloadScript({type:'frame',filePath:seed}));
let win;const ready=new Promise(resolve=>app.once('browser-window-created',(_e,w)=>w.webContents.once('did-finish-load',()=>resolve(w))));
const delay=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>win.webContents.executeJavaScript(code,true);
async function until(code,label){for(let i=0;i<160;i++){if(await js(`!!(${code})`)){console.log('OK: '+label);return;}await delay(100);}throw Error('Timeout: '+label);}
async function click(selector){await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(150);}
async function change(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(100);}
async function shot(name){writeFileSync(join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
  try{
    win=await ready;win.webContents.setBackgroundThrottling(false);win.show();
    await until("document.querySelector('[data-id=\"Cronos\"]')",'Cronos no canvas');
    await js('window.cronosEvents=[];void window.o.flows.onStatus(s=>window.cronosEvents.push(s));true');
    await until("[0,1,2,3,4].every(i=>window.cronosEvents.some(s=>s.nodeId==='g'+i+'-intervalo'&&s.state==='ok'))",'recorrência nas cinco galáxias com apenas g0 aberta');
    await click('[data-id="Cronos"] button[title="Configurar"]');
    assert.equal(await js("document.querySelectorAll('.flow-dialog select')[0].options.length"),7);
    assert.ok(await js("document.querySelector('.flow-dialog').textContent.includes('Segundos')"));await shot('01-segundos');
    const mode='.flow-dialog select';
    for(const value of ['startup','after-start','interval','daily','date','signal','delay']){await change(mode,value);assert.equal(await js("document.querySelector('.flow-dialog select').value"),value);await shot('modo-'+value);}
    await change('.flow-dialog .flow-row select','days');await change('.flow-dialog .flow-row input','2');
    await shot('02-dias');await js("document.querySelector('.flow-dialog').requestSubmit()");await delay(300);
    await js("window.dispatchEvent(new Event('zenite:flush-canvas'))");await delay(150);
    const saved=JSON.parse(readFileSync(join(profile,'workspaces/g0.json'),'utf8'));
    assert.equal(saved.nodes.find(n=>n.id==='Cronos').element.flow.chronos.unit,'days');
    await click('[data-id="Ignição"] button[title="Configurar"]');
    assert.deepEqual(await js("[...document.querySelector('.flow-dialog select').options].map(o=>o.value)"),['manual','folder']);
    await js("[...document.querySelectorAll('.flow-dialog button')].find(b=>b.textContent==='Cancelar').click()");
    await click('[data-id="Espera antiga"] button[title="Configurar"]');
    assert.ok(await js("document.querySelector('.flow-dialog h2').textContent.includes('Cronos')"));
    assert.equal(await js("document.querySelector('.flow-dialog input[type=number]').value"),'5');await shot('03-migracao');
    await js("[...document.querySelectorAll('.flow-dialog button')].find(b=>b.textContent==='Salvar').click()");
    console.log('PASS: Cronos, modos, unidades, persistência, migração e cinco galáxias');
    writeFileSync(join(dir,'resultado.json'),JSON.stringify({ok:true,profile,checks:['sete modos','segundos e dias','persistência','migração','Ignição sem relógio','cinco galáxias']},null,2));
    if(process.argv.includes('--keep-open')){await click('[data-id="Cronos"] button[title="Configurar"]');return;}
    await delay(650);win.destroy();app.quit();
  }catch(e){console.error(e.stack);if(win)await shot('erro').catch(()=>{});app.exit(1);}
});
require(join(root,'out/main/index.js'));
