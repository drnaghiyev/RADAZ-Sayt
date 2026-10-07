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
for(const asset of ['site.js','site.css','platform.js','platform.css','assets/radaz-viewer.jpg','assets/radaz-mpr.jpg','assets/radaz-report.jpg']){
  if(!existsSync(new URL('./dist/'+asset,import.meta.url)))throw Error('Missing asset: '+asset);
}
if(!html.includes('window.RADAZ_STANDALONE=true'))throw Error('Demo mode must remain explicit.');
console.log(JSON.stringify({inlineScripts:checked,customScripts:'valid',assets:7,mode:'static preview; server enables production'}));
