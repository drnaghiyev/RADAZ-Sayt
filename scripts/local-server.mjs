import {Miniflare} from 'miniflare';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const port=Number(process.env.RADAZ_PORT||5195),directory=resolve(process.env.RADAZ_LOCAL_DATA||join(root,'data','local'));
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('RADAZ_PORT must be 1024–65535');
await mkdir(directory,{recursive:true});
const keyfile=join(directory,'encryption.key');let key;
try{key=(await readFile(keyfile,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32).toString('base64');await writeFile(keyfile,key,{flag:'wx',mode:0o600});}
if(Buffer.from(key,'base64').length!==32)throw Error('Local encryption key is invalid. Preserve the data folder and restore its original key.');
await import('./build-cloud.mjs');
const origin=`http://127.0.0.1:${port}`;
const mf=new Miniflare({host:'127.0.0.1',port,d1Persist:join(directory,'d1'),r2Persist:join(directory,'r2'),workers:[{name:'radaz',modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],assets:{directory:join(root,'dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true},assetConfig:{not_found_handling:'single-page-application'}},bindings:{PUBLIC_ORIGIN:origin,SETTINGS_ENCRYPTION_KEY:key,TRUST_SITES_IDENTITY:'false',LOCAL_DESKTOP:'true'}}]});
const db=await mf.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)').run();
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;
 const statements=(await readFile(join('drizzle',name),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 await db.batch([...statements.map(s=>db.prepare(s)),db.prepare('INSERT INTO local_migrations VALUES(?,?)').bind(name,new Date().toISOString())]);
}
await mf.ready;
console.log(`RADAZ local server ready: ${origin}`);
console.log('Local accounts and files persist in data/local. Press Ctrl+C to stop.');
const stop=async()=>{await mf.dispose();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
