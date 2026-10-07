import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createOwner, passwordHash, now } from '../server/store.mjs';

const dataDir=mkdtempSync(path.join(tmpdir(),'radaz-site-test-'));
const encryptionKey=randomBytes(32).toString('base64');
const origin='http://127.0.0.1:5188';
let app,store,server,base,ownerCookie,doctorCookie,otherCookie,caseId,launchTicket;
async function request(route,{method='GET',body,cookie,requestOrigin=origin,headers={}}={}){
  const response=await fetch(base+route,{method,headers:{Origin:requestOrigin,'X-RADAZ-CLIENT':'web',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();return {response,data,status:response.status};
}
async function login(email){const r=await request('/api/auth/login',{method:'POST',body:{email,password:'Synthetic-Test-Password-2026!'}});assert.equal(r.status,200);return r.response.headers.get('set-cookie').split(';')[0];}
before(async()=>{
  ({app,store}=createApp({origin,dataDir,encryptionKey,production:false}));
  await createOwner(store,{email:'owner@example.invalid',password:'Synthetic-Test-Password-2026!'});
  const digest=await passwordHash('Synthetic-Test-Password-2026!');
  for(const n of [1,2])store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('doctor-'+n,`doctor${n}@example.invalid`,digest,'doctor',1,JSON.stringify({name:'Synthetic doctor '+n,price:45}),now());
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
  ownerCookie=await login('owner@example.invalid');doctorCookie=await login('doctor1@example.invalid');otherCookie=await login('doctor2@example.invalid');
  store.put('case','doctor-1',{id:'RZ-TEST',doctor_id:'doctor-1',patient:{first_name:'Synthetic',last_name:'Test'},status:'pending',archive_path:'fixture.zip',file_name:'fixture.zip',report:'',version:0,created_at:now()});caseId='RZ-TEST';writeFileSync(path.join(dataDir,'archives','fixture.zip'),Buffer.from('PK\x03\x04synthetic archive'));
});
after(async()=>{await new Promise(r=>server.close(r));store.close();rmSync(dataDir,{recursive:true,force:true});});

test('production page does not enable standalone fallback or demo login',async()=>{
  const r=await request('/');assert.equal(r.status,200);assert.match(r.data,/RADAZ_STANDALONE=false;window.RADAZ_PRODUCTION=true/);
  assert.equal((await request('/api/demo/login',{method:'POST',body:{role:'admin'}})).status,404);
  assert.equal((await request('/api/auth/register',{method:'POST',body:{name:'Fake owner',role:'admin',email:'fake@example.invalid',password:'Synthetic-Test-Password-2026!'}})).status,400);
});
test('only the owner can read or write payment settings; CSRF is rejected',async()=>{
  for(const cookie of [undefined,doctorCookie,otherCookie]){
    assert.ok([401,403].includes((await request('/api/admin/payment-settings',{cookie})).status));
    assert.ok([401,403].includes((await request('/api/admin/payment-settings',{cookie,method:'PUT',body:{provider:'epoint'}})).status));
  }
  assert.equal((await request('/api/admin/payment-settings',{cookie:ownerCookie,method:'PUT',requestOrigin:'https://evil.example',body:{provider:'epoint'}})).status,403);
});
test('payment secrets are encrypted at rest, never returned, retained on blank edit and explicitly cleared',async()=>{
  const secret='SYNTHETIC-NOT-A-REAL-PAYMENT-KEY-52646';
  const fields={provider:'epoint',environment:'test',currency:'AZN',merchant_id:'fixture',bank_name:'Synthetic Bank',api_key:secret};
  assert.equal((await request('/api/admin/payment-settings',{cookie:ownerCookie,method:'PUT',body:fields})).status,200);
  let r=await request('/api/admin/payment-settings',{cookie:ownerCookie});assert.equal(r.data.secrets.api_key,true);assert.equal(r.data.values.api_key,undefined);assert.equal(JSON.stringify(r.data).includes(secret),false);assert.equal(r.response.headers.get('cache-control'),'no-store');
  const stored=store.db.prepare("SELECT value FROM settings WHERE name='payment'").get().value;assert.equal(stored.includes(secret),false);assert.equal(stored.includes('Synthetic Bank'),false);
  await request('/api/admin/payment-settings',{cookie:ownerCookie,method:'PUT',body:{...fields,api_key:''}});assert.equal(store.unseal('payment').api_key,secret);
  const second=createApp({origin,dataDir,encryptionKey,production:false});assert.equal(second.store.unseal('payment').api_key,secret);second.store.close();
  await request('/api/admin/payment-settings',{cookie:ownerCookie,method:'PUT',body:{...fields,api_key:'',clear_secrets:['api_key']}});assert.equal(store.unseal('payment').api_key,undefined);
  const config=await request('/api/config');assert.equal(JSON.stringify(config.data).includes('fixture'),false);
});
test('templates preserve rich formatting, enforce four groups and isolate owners',async()=>{
  for(const modality of ['CT','MR','CR','US']){
    const r=await request('/api/x/templates',{cookie:doctorCookie,method:'POST',body:{title:'Fixture '+modality,modality,lang:'az',html:'<h2>Heading</h2><p><strong>Bold</strong></p><table><tr><td>Cell</td></tr></table><script>bad()</script><img src=x onerror=bad()>'}});assert.equal(r.status,200);assert.match(r.data.html,/<strong>Bold<\/strong>/);assert.match(r.data.html,/<table>/);assert.doesNotMatch(r.data.html,/script|onerror|<img/);
    assert.equal((await request('/api/x/templates/'+r.data.id,{cookie:otherCookie,method:'PUT',body:{title:'Stolen',modality,lang:'az',html:'<p>Stolen</p>'}})).status,404);
    assert.equal((await request('/api/x/templates/'+r.data.id,{cookie:otherCookie,method:'DELETE'})).status,404);
  }
  assert.equal((await request('/api/x/templates',{cookie:doctorCookie})).data.length,4);
  assert.equal((await request('/api/x/templates',{cookie:otherCookie})).data.length,0);
  assert.equal((await request('/api/x/templates',{cookie:doctorCookie,method:'POST',body:{title:'Invalid',modality:'OTHER',lang:'az',html:'<p>Text</p>'}})).status,400);
});

test('consultation uploads persist, reserve capacity and require a receipt token for tracking',async()=>{
  const slot=await request('/api/me/availability',{cookie:doctorCookie,method:'POST',body:{date:'2099-10-08',time:'09:00–10:00',capacity:1}});
  assert.equal(slot.status,201);
  const payload={doctor_id:'doctor-1',slot_id:slot.data.id,consent:true,patient:{first_name:'Synthetic',last_name:'Upload',email:'patient@example.invalid',phone:'+000000000',complaints:'Synthetic test only'},metadata:{modality:'CT',dicom_count:1}};
  async function upload(){const body=new FormData();body.append('payload',JSON.stringify(payload));body.append('archive',new Blob([Buffer.from('PK\x03\x04synthetic upload')]),'fixture.zip');const response=await fetch(base+'/api/consultations',{method:'POST',headers:{Origin:origin,'X-RADAZ-CLIENT':'web'},body});return {status:response.status,data:await response.json()};}
  const created=await upload();assert.equal(created.status,201);assert.equal(created.data.case.payment_status,'not_charged');assert.equal(created.data.case.status,'pending');assert.ok(created.data.token);assert.equal(created.data.case.archive_path,undefined);assert.equal(created.data.case.token_hash,undefined);
  assert.equal((await upload()).status,409);
  assert.equal((await request('/api/tracking',{method:'POST',body:{id:created.data.case.id,token:'wrong'}})).status,404);
  const tracked=await request('/api/tracking',{method:'POST',body:{id:created.data.case.id,token:created.data.token}});assert.equal(tracked.status,200);assert.equal(tracked.data.report,'');
  const archive=await request('/api/cases/'+created.data.case.id+'/archive',{cookie:doctorCookie});assert.equal(archive.status,200);assert.match(archive.data,/synthetic upload/);
});
test('reports authorize the assigned doctor, preserve formatting and reject lost updates',async()=>{
  assert.equal((await request('/api/cases/'+caseId,{cookie:otherCookie})).status,403);
  assert.equal((await request('/api/cases/'+caseId+'/archive',{cookie:otherCookie})).status,403);
  let r=await request('/api/cases/'+caseId+'/report',{cookie:doctorCookie,method:'PUT',body:{version:0,html:'<p><b>Synthetic report</b></p>'}});assert.equal(r.status,200);assert.equal(r.data.version,1);
  assert.equal((await request('/api/cases/'+caseId+'/report',{cookie:doctorCookie,method:'PUT',body:{version:0,html:'<p>Stale update</p>'}})).status,409);
  assert.equal((await request('/api/cases/'+caseId+'/report',{cookie:doctorCookie,method:'PUT',body:{version:1,html:'<p>Approved</p>',approve:true}})).status,200);
  assert.equal((await request('/api/cases/'+caseId+'/report',{cookie:doctorCookie,method:'PUT',body:{version:2,html:'<p>Cannot overwrite</p>'}})).status,409);
});
test('Viewer grant is short-lived, origin-bound, single use, and contains no patient name',async()=>{
  assert.equal((await request('/api/admin/viewer-settings',{cookie:ownerCookie,method:'PUT',body:{web_url:'javascript:alert(1)',desktop_enabled:true}})).status,400);
  assert.equal((await request('/api/admin/viewer-settings',{cookie:ownerCookie,method:'PUT',body:{web_url:'http://localhost:5173/',desktop_enabled:true}})).status,200);
  assert.equal((await request('/api/cases/'+caseId+'/viewer-launch',{cookie:otherCookie,method:'POST',body:{}})).status,403);
  const r=await request('/api/cases/'+caseId+'/viewer-launch',{cookie:doctorCookie,method:'POST',body:{}});assert.equal(r.status,200);assert.equal(r.data.expires_in,120);assert.ok(r.data.desktop_url.startsWith('radaz://open?'));assert.ok(!r.data.url.includes('Synthetic'));
  const params=new URLSearchParams(new URL(r.data.url).hash.slice(1));launchTicket=params.get('radaz-ticket');assert.equal(params.get('radaz-site'),origin);
  assert.equal((await request('/api/viewer/redeem',{method:'POST',body:{ticket:launchTicket},requestOrigin:'https://evil.example'})).status,403);
  const ok=await request('/api/viewer/redeem',{method:'POST',body:{ticket:launchTicket},requestOrigin:'http://localhost:5173'});assert.equal(ok.status,200);assert.equal(ok.response.headers.get('access-control-allow-origin'),'http://localhost:5173');
  assert.equal((await request('/api/viewer/redeem',{method:'POST',body:{ticket:launchTicket},requestOrigin:'http://localhost:5173'})).status,403);
  const expired=await request('/api/cases/'+caseId+'/viewer-launch',{cookie:doctorCookie,method:'POST',body:{}});const old=new URLSearchParams(new URL(expired.data.url).hash.slice(1)).get('radaz-ticket');store.db.prepare('UPDATE launches SET expires=0').run();assert.equal((await request('/api/viewer/redeem',{method:'POST',body:{ticket:old},requestOrigin:'http://localhost:5173'})).status,403);
});
test('secret files and database are outside the static web root; logout revokes session',async()=>{
  for(const route of ['/.env','/data/radaz.sqlite','/server/store.mjs'])assert.equal((await request(route)).status,404);
  await request('/api/auth/logout',{method:'POST',cookie:ownerCookie,body:{}});assert.equal((await request('/api/admin/payment-settings',{cookie:ownerCookie})).status,401);
});
