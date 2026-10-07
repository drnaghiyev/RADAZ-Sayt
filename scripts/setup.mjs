import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { openStore, createOwner } from '../server/store.mjs';

if(!process.stdin.isTTY)throw Error('Run setup in an interactive terminal. Passwords must not be passed in command-line arguments.');
if(existsSync('.env')){process.loadEnvFile('.env');if(Buffer.from(process.env.SETTINGS_ENCRYPTION_KEY||'','base64').length!==32)throw Error('Existing .env needs a valid SETTINGS_ENCRYPTION_KEY before setup. Preserve the key once created.');}
const rl=createInterface({input:process.stdin,output:process.stdout});
const email=(await rl.question('Owner email: ')).trim();
const origin=(await rl.question('Site origin (https://... or http://127.0.0.1:5188): ')).trim();
new URL(origin);
rl.close();
async function hidden(prompt){process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';const receive=chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){finish();reject(Error('Cancelled'));return;}if(c==='\r'||c==='\n'){finish();resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}};const finish=()=>{process.stdin.off('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('data',receive);});}
const password=await hidden('Owner password (12+ characters, hidden): ');
if(password!==await hidden('Repeat password: '))throw Error('Passwords do not match.');
const key=process.env.SETTINGS_ENCRYPTION_KEY||randomBytes(32).toString('base64');
const store=openStore(process.env.DATA_DIR||'./data',key);
try{await createOwner(store,{email,password});if(!existsSync('.env'))writeFileSync('.env',`NODE_ENV=${origin.startsWith('https:')?'production':'development'}\nPUBLIC_ORIGIN=${new URL(origin).origin}\nHOST=127.0.0.1\nPORT=5188\nDATA_DIR=./data\nOWNER_EMAIL=${email}\nSETTINGS_ENCRYPTION_KEY=${key}\n`,{mode:0o600,flag:'wx'});console.log('Owner created. Keep .env and data backed up privately. Run npm start.');}finally{store.close();}
