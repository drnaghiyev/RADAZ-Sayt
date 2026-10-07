import {build} from 'esbuild';
import {mkdir,readdir,cp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
await mkdir(new URL('client/',dist),{recursive:true});await mkdir(new URL('server/',dist),{recursive:true});
for(const entry of await readdir(dist,{withFileTypes:true})){
 if(['client','server','.openai'].includes(entry.name))continue;
 await cp(new URL(entry.name,dist),new URL('client/'+entry.name,dist),{recursive:true});
}
const index=new URL('client/index.html',dist);
await writeFile(index,(await readFile(index,'utf8')).replace('window.RADAZ_STANDALONE=true;','window.RADAZ_STANDALONE=false;window.RADAZ_PRODUCTION=true;'));
await build({entryPoints:[fileURLToPath(new URL('cloud/worker.mjs',root))],outfile:fileURLToPath(new URL('server/index.js',dist)),bundle:true,format:'esm',platform:'node',banner:{js:"import { createRequire } from 'node:module'; const require = createRequire('/worker.js');"},target:'es2022',external:['node:*'],conditions:['workerd','worker','browser'],logLevel:'info'});

