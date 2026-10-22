const {existsSync,writeFileSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
module.exports=async({win,out,profile,project,api})=>{
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const js=code=>win.webContents.executeJavaScript(code,true);
 const command=name=>js(`window.dispatchEvent(new CustomEvent('zenite:command',{detail:${JSON.stringify(name)}}))`);
 const endpoint=async path=>{const r=await fetch(api()+path).then(r=>r.json());if(r.error)throw Error(r.error);return r;};
 await delay(2000);
 await js("document.querySelectorAll('.workspace-item')[4].click()");await delay(1600);
 await endpoint('/start?name=flows');await delay(1000);
 await js("document.querySelector('[data-id=\"inicio\"] button[title=\"Executar a partir daqui\"]').click()");await delay(6500);await endpoint('/shot?name=fluxo-resultado');await endpoint('/stop');
 const flowResult=readFileSync(join(project,'resultado-fluxo.json'),'utf8');
 if(!flowResult.includes('OK'))throw Error('O fluxo não escreveu a saída real');
 writeFileSync(join(out,'flow-evidence.json'),JSON.stringify({result:flowResult,verified:true},null,2));
 await js("document.querySelectorAll('.workspace-item')[5].click()");await delay(3000);
 const state=await js("window.o.canvas.load('agents')");const sol=state.nodes.find(n=>n.id==='sol-cli').terminal;
 const result=await js(`window.o.pty.promoteSun(${JSON.stringify({...sol,sun:true,cols:100,rows:32})})`);
 if(!result.ok)throw Error('Promoção do Sol recusada');
 await delay(1000);await endpoint('/shot?name=sol-inicial');
 await endpoint('/start?name=agents');
 writeFileSync(join(project,'iniciar-agentes.txt'),'Executar o briefing fictício conectado.\n');
 console.log('AGENTES INICIADOS');
 const end=Date.now()+300000;
 while(Date.now()<end){
  const files=['sol','builder','reviewer'].map(role=>join(project,'agent-'+role+'-done.json'));
  if(files.every(existsSync))break;
  await delay(1000);
 }
 await endpoint('/shot?name=sol-resultado');
 console.log('AGENTES TAKE '+JSON.stringify(await endpoint('/stop')));
 const actual={};
 for(const role of ['sol','builder','reviewer']){const file=join(project,'agent-'+role+'-done.json');actual[role]=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{complete:false};}
 actual.index=existsSync(join(project,'index.html'));actual.review=existsSync(join(project,'revisao.md'));
 writeFileSync(join(out,'agents-evidence.json'),JSON.stringify(actual,null,2));
 if(actual.index){
  // Mostra o HTML produzido pelo agente em um elemento web do mesmo projeto.
  const current=await js("window.o.canvas.load('agents')");
  current.nodes.push({id:'agent-site',kind:'web',x:0,y:1000,width:1500,height:850,element:{id:'agent-site',kind:'web',title:'Aurora · construída pelo Codex',url:api()+'/produced'}});
  // Salvar pela API real e recarregar o canvas mudando de galáxia.
  await js(`window.o.canvas.save('agents',${JSON.stringify(current)})`);
  await js("document.querySelectorAll('.workspace-item')[1].click()");await delay(500);await js("document.querySelectorAll('.workspace-item')[5].click()");await delay(2200);
  await command('fit-view');await delay(1300);await endpoint('/start?name=agent-result');await delay(6000);await endpoint('/shot?name=agentes-entrega');await endpoint('/stop');
 }
 await command('open-settings');await delay(350);
 await js("[...document.querySelectorAll('.settings-tabs button')].find(e=>e.textContent.trim()==='Agentes').click()");await delay(1400);
 await endpoint('/start?name=isolation');await delay(9000);await endpoint('/shot?name=opcoes-isolamento');await endpoint('/stop');
 await js("document.querySelector('.settings-head button').click()");
 console.log('AGENTS COMPLETE '+JSON.stringify(actual));
};
