import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let checked=0;
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  if(!match[1].trim())continue;
  new vm.Script(match[1],{filename:`inline-${++checked}.js`});
}
new vm.Script(readFileSync(new URL('./dist/site.js',import.meta.url),'utf8'),{filename:'site.js'});
new vm.Script(readFileSync(new URL('./dist/platform.js',import.meta.url),'utf8'),{filename:'platform.js'});
new vm.Script(readFileSync(new URL('./dist/real.js',import.meta.url),'utf8'),{filename:'real.js'});
new vm.Script(readFileSync(new URL('./dist/admin.js',import.meta.url),'utf8'),{filename:'admin.js'});
new vm.Script(readFileSync(new URL('./dist/portal.js',import.meta.url),'utf8'),{filename:'portal.js'});
for(const file of ['workspace.js','editor.js'])new vm.Script(readFileSync(new URL('./dist/'+file,import.meta.url),'utf8'),{filename:file});
for(const asset of ['site.js','site.css','platform.js','platform.css','real.js','admin.js','portal.js','workspace.js','editor.js','editor.bundle.js','professional.css','assets/radaz-viewer-ct.jpg','assets/radaz-report-ct.jpg']){
  if(!existsSync(new URL('./dist/'+asset,import.meta.url)))throw Error('Missing asset: '+asset);
}
if(!html.includes('window.RADAZ_STANDALONE=false;window.RADAZ_PRODUCTION=true;'))throw Error('Production must never fall back to ephemeral demo accounts.');
console.log(JSON.stringify({inlineScripts:checked,customScripts:'valid',assets:13,mode:'production; API required'}));
