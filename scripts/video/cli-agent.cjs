// Codex CLI real dentro do PTY do Zênite; o prompt só contém o projeto fictício.
const { spawn } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { request } = require('node:http');
const role = process.argv[2];
const project = process.cwd();
const call = (path, body) => new Promise((resolve, reject) => {
  const req=request({socketPath:process.env.O_PIPE,path,method:'POST',headers:{'content-type':'application/json','x-o-terminal':process.env.O_TERMINAL_ID,'x-o-token':process.env.O_TOKEN}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>res.statusCode===200?resolve(JSON.parse(data)):reject(Error('API recusou a operação: '+res.statusCode)));});req.on('error',reject);req.end(JSON.stringify(body));
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safe = text => text.replace(/C:[\\/]Users[\\/][^\\/\r\n]+/gi,'<perfil-local>').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'<conta-oculta>');
async function model(task, name){
 const output=join(project,'resposta-'+name+'.md');
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`codex --no-daemon -c model_reasoning_effort=low -a never exec --skip-git-repo-check -s workspace-write -o ${output} -`],{cwd:project,env:{...process.env},windowsHide:true,windowsVerbatimArguments:true,stdio:['pipe','pipe','pipe']});
 let captured='';
 const stream=chunk=>{const text=chunk.toString();captured+=text;process.stdout.write(safe(text));};
 child.stdout.on('data',stream);child.stderr.on('data',stream);child.stdin.end(task);
 const code=await new Promise(resolve=>child.once('close',resolve));
 return {code,text:existsSync(output)?readFileSync(output,'utf8'):captured.slice(-3000)};
}
async function main(){
 console.log('CODEX CLI · '+role.toUpperCase()+'\nProjeto fictício Aurora · sessão real\n');
 while(!existsSync(join(project,'iniciar-agentes.txt')))await sleep(500);
 if(process.env.ZENITE_FILM_COMPLETION==='1'){
  if(role==='builder'){console.log('index.html foi criado pelo Codex na tomada anterior.\nImplementação real preservada; pronta para revisão.');setInterval(()=>{},10000);return;}
  if(role==='sol'){
   const plan=await model('Você é o Sol do projeto fictício Aurora. Execute zn list e zn note read "Briefing CLI". O construtor Codex já produziu index.html. Leia esse arquivo somente e escreva uma instrução curta para o Revisor Codex conferir a implementação e testar o JavaScript. Não execute a revisão, não altere arquivos e não envie pedidos por conta própria: o coordenador deste terminal enviará sua instrução pelo canvas. Não leia configurações nem dados pessoais.','plano-sol');
   console.log('\nSOL · enviando a instrução gerada pelo Codex ao Revisor pelo canvas.');
   const reply=await call('/ask',{to:'Revisor Codex',message:plan.text,wait:true,timeoutSec:300});
   console.log('\nRESPOSTA REAL DO REVISOR\n'+safe(reply.reply||JSON.stringify(reply)));
   const final=await model('Você é o Sol do projeto Aurora. A revisão real do outro Codex foi concluída. Leia revisao.md no diretório atual e atualize a nota Entrega CLI usando zn note write. Registre arquivos e resultado real, sem inventar testes. Não leia dados pessoais. Resposta recebida: '+(reply.reply||''),'resumo-sol');
   writeFileSync(join(project,'agent-sol-done.json'),JSON.stringify({role,code:final.code,hasResponse:true}));
  }else{
   while(!(await call('/list',{})).pendingForMe?.length)await sleep(700);
   const result=await model('Você é o Revisor Codex do projeto fictício Aurora. Execute zn list e leia Briefing CLI com zn note read. Revise index.html existente, extraia seu JavaScript para check.cjs e rode node --check check.cjs. Escreva revisao.md com os achados reais. Não altere a implementação, não leia dados pessoais e não abra o desktop. Não responda ao pedido via zn reply: o coordenador deste terminal enviará a sua conclusão real pelo canvas. Seja breve.','revisor');
   await call('/reply',{message:result.text});
   writeFileSync(join(project,'agent-reviewer-done.json'),JSON.stringify({role,code:result.code,hasResponse:true}));
  }
  setInterval(()=>{},10000);return;
 }
 let task;
 if(role==='sol') task='Você é o Sol do projeto fictício Aurora no Zênite. Sua autoridade já foi concedida pela interface. Execute zn list, depois zn help. Leia a nota Briefing CLI com zn note read. Delegue uma tarefa real ao terminal Construtor Codex com zn ask: criar index.html simples, bonito e funcional para um painel de tarefas Aurora em HTML/CSS/JS puro, sem dependências ou rede, com adicionar tarefa e concluir tarefa. O construtor tem o diretório de projeto ligado. Aguarde a resposta. Depois peça ao Revisor Codex para revisar index.html e escrever revisao.md com o resultado, usando zn ask e aguardando a resposta. Por fim atualize a nota Entrega CLI com zn note write, descrevendo os arquivos criados e o resultado real da revisão. Trabalhe somente no projeto Aurora, não leia configurações de contas nem dados pessoais. Não abra navegador ou desktop. Não invente ações; utilize os comandos zn reais. Responda em português e seja breve. Se alguma ação for recusada, relate o erro e não contorne permissões.';
 else {
  console.log('Aguardando um pedido do Sol pelo canvas...');
  while(true){const list=await call('/list',{}); if(list.pendingForMe?.length){task='Você é '+(role==='builder'?'o construtor':'o revisor')+' Codex do projeto fictício Aurora. Execute zn list e zn help, leia Briefing CLI com zn note read e consulte o pedido pendente do Sol. '+(role==='builder'?'Implemente index.html no diretório atual com um painel de tarefas bonito, tema escuro, HTML/CSS/JS puro e funcional: adicionar tarefa e marcar concluída. Sem dependências ou rede.':'Revise o index.html existente, verifique o JavaScript com node --check extraindo-o temporariamente em check.cjs e escreva revisao.md com os achados reais. Não altere a implementação a menos que exista erro claro.')+' No final responda ao pedido pendente com zn reply, indicando arquivos e resultado real. Trabalhe somente nos arquivos do projeto Aurora e no conteúdo conectado. Não leia contas ou dados pessoais. Não abra navegador ou desktop. Responda em português e seja breve.';break;}await sleep(1000);}
 }
 const output=join(project,'resposta-'+role+'.md');
 const args=['/d','/s','/c',`codex --no-daemon -c model_reasoning_effort=low -a never exec --skip-git-repo-check -s workspace-write -o "${output}" -`];
 const child=spawn(process.env.ComSpec||'cmd.exe',args,{cwd:project,env:{...process.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout.on('data',c=>process.stdout.write(c));child.stderr.on('data',c=>process.stdout.write(c));
 child.stdin.end(task);
 const code=await new Promise(resolve=>child.once('close',resolve));
 console.log('\nCodex terminou com código '+code+'.');
 writeFileSync(join(project,'agent-'+role+'-done.json'),JSON.stringify({role,code,hasResponse:existsSync(output)}));
 if(existsSync(output))console.log(readFileSync(output,'utf8'));
 setInterval(()=>{},10000);
}
main().catch(error=>{console.error(error.message);setInterval(()=>{},10000);});
