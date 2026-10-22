const {writeFileSync}=require('node:fs');
const {join}=require('node:path');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
console.log('VALIDAÇÃO DO PROJETO AURORA\n\nAguardando a entrada real do fluxo...');
let buffer='';
process.stdin.on('data',data=>{
 buffer+=data;
 if(!/[\r\n]/.test(buffer))return;
 const text=buffer.replace(/\x1b\[20[01]~/g,'').trim();buffer='';
 if(!text)return;
 writeFileSync(join(process.cwd(),'resultado-fluxo.json'),JSON.stringify({entrada:text,recebido:true},null,2));
 console.log('\n\x1b[32m✓ Entrada recebida do fluxo\x1b[0m\n\n'+text+'\n\nresultado-fluxo.json salvo no projeto.');
});
