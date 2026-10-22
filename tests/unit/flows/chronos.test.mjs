import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const outfile=resolve('out/test/chronos.mjs');
await build({stdin:{contents:'export * from "./src/shared/chronos";export * from "./src/shared/flows";export * from "./src/main/flowRunner";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
const {ChronosScheduler,chronosSeconds,temporalSpec,newFlowSpec,outputsOf,runFlow}=await import(pathToFileURL(outfile));
const flow=(mode,extra={})=>({type:'chronos',chronos:{mode,...extra}});
const start=new Date(2026,9,21,8,0,0), at=seconds=>new Date(start.getTime()+seconds*1000);

test('Cronos converte segundos, minutos, horas e dias e valida duração',()=>{
  for(const [unit,value]of Object.entries({seconds:2,minutes:120,hours:7200,days:172800}))assert.equal(chronosSeconds({mode:'delay',value:2,unit}),value);
  for(const value of [-1,NaN,Infinity,365*86400+1])assert.throws(()=>chronosSeconds({mode:'delay',value,unit:'seconds'}));
  assert.throws(()=>chronosSeconds({mode:'interval',value:0}));
});
test('inicialização executa uma vez por astro e por sessão, em cinco galáxias',()=>{
  const scheduler=new ChronosScheduler();
  for(let i=0;i<5;i++){assert.equal(scheduler.tick('galaxia-'+i,flow('startup'),start),true);assert.equal(scheduler.tick('galaxia-'+i,flow('startup'),at(1)),false);}
  assert.equal(new ChronosScheduler().tick('galaxia-0',flow('startup'),at(2)),true);
});
test('atraso após inicialização executa apenas uma vez',()=>{
  const scheduler=new ChronosScheduler(),spec=flow('after-start',{value:10,unit:'seconds'});
  assert.equal(scheduler.tick('a',spec,start),false);assert.equal(scheduler.tick('a',spec,at(9)),false);assert.equal(scheduler.tick('a',spec,at(10)),true);assert.equal(scheduler.tick('a',spec,at(20)),false);
});
test('intervalo de dez segundos e recorrência a cada dois dias',()=>{
  for(const [unit,value,seconds]of [['seconds',10,10],['days',2,172800]]){
    const s=new ChronosScheduler(),spec=flow('interval',{unit,value});
    assert.equal(s.tick('a',spec,start),false);assert.equal(s.tick('a',spec,at(seconds-1)),false);assert.equal(s.tick('a',spec,at(seconds)),true);assert.equal(s.tick('a',spec,at(seconds)),false);assert.equal(s.tick('a',spec,at(2*seconds)),true);
  }
});
test('horário recorrente respeita horário local, dias da semana e evita duplicação',()=>{
  const s=new ChronosScheduler(),spec=flow('daily',{at:'08:01',days:[start.getDay()]});
  assert.equal(s.tick('a',spec,start),false);assert.equal(s.tick('a',spec,at(60)),true);assert.equal(s.tick('a',spec,at(61)),false);assert.equal(s.tick('a',spec,at(86460)),false);
  assert.throws(()=>s.tick('b',flow('daily',{at:'25:90'}),start));
});
test('data específica dispara uma vez e não recupera datas vencidas ao reabrir',()=>{
  const s=new ChronosScheduler(),spec=flow('date',{date:at(10).toISOString()});
  assert.equal(s.tick('a',spec,start),false);assert.equal(s.tick('a',spec,at(10)),true);assert.equal(s.tick('a',spec,at(11)),false);
  assert.equal(new ChronosScheduler().tick('a',spec,at(20)),false);
});
test('pausar, alterar configuração e remover um astro reinicializa seu agendamento',()=>{
  const s=new ChronosScheduler(),spec=flow('interval',{value:10});
  s.tick('a',spec,start);assert.equal(s.tick('a',{...spec,paused:true},at(15)),false);assert.equal(s.tick('a',spec,at(20)),false);assert.equal(s.tick('a',spec,at(30)),true);
  assert.equal(s.tick('a',flow('interval',{value:20}),at(40)),false);s.retain(new Set());assert.equal(s.tick('a',spec,at(100)),false);
});
test('esperas por entrada e sinal não são disparadas pelo relógio global',()=>{
  const s=new ChronosScheduler();for(const mode of ['delay','signal'])assert.equal(s.tick(mode,flow(mode),start),false);
});
test('configurações inválidas não disparam agendamentos',()=>{
  const s=new ChronosScheduler();
  for(const spec of [flow('invalid'),flow('daily',{days:[9]}),flow('interval',{unit:'invalid'}),flow('signal',{timeoutSeconds:-1})])assert.throws(()=>s.tick('invalid',spec,start));
});
test('migração preserva durações, sinais e horários existentes',()=>{
  assert.equal(temporalSpec({type:'wait',waitSeconds:10}).chronos.value,10);
  assert.equal(temporalSpec({type:'wait',waitMode:'signal',signalName:'API'}).chronos.signalName,'API');
  assert.equal(temporalSpec({type:'ignition',schedule:'interval',everyMinutes:2}).chronos.unit,'minutes');
  assert.deepEqual(temporalSpec({type:'ignition',schedule:'daily',at:'15:30',days:[1]}).chronos,{mode:'daily',at:'15:30',days:[1]});
  assert.equal(newFlowSpec('chronos').chronos.unit,'seconds');assert.equal(outputsOf(newFlowSpec('chronos'))[0].id,'continue');
});
test('atraso do motor emite saída personalizada e preserva entrada e variável continue',async()=>{
  const nodes=[{id:'c',kind:'flow',element:{flow:flow('delay',{value:0.01,output:'{{entrada}}:{{continue}}'})}},{id:'t',kind:'terminal',terminal:{id:'t',title:'Destino'}}];
  const delivered=[];await runFlow({nodes,edges:[{id:'e',source:'c',target:'t',sourceHandle:'continue'}]},'c',{deliver:async(id,text)=>delivered.push([id,text]),status(){},hasQuota:()=>true},'dados');
  assert.deepEqual(delivered,[['t','dados:true']]);
});
