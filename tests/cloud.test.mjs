import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {dbTools,epointSignature,verifySignature} from '../cloud/shared.mjs';
import {settle} from '../cloud/payments.mjs';
import {dateRange,calculate,parseRule} from '../cloud/earnings.mjs';
let mf,db,ownerCookie,patientCookie,doctorCookie,doctorId,caseId,receipt,otherCookie;
const base='https://radaz.test',pass='Test-only-long-password!';
async function call(path,{method='GET',cookie,body,headers={},raw}={}){const res=await mf.dispatchFetch(base+'/api'+path,{method,headers:{Origin:base,'X-RADAZ-CLIENT':'web',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});const data=await res.json();return {status:res.status,data,cookie:res.headers.get('Set-Cookie')?.split(';')[0]};}
before(async()=>{
 mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{TRUST_SITES_IDENTITY:'true',PUBLIC_ORIGIN:base,OWNER_PLATFORM_ID:'verified-owner',OWNER_EMAIL:'owner@radaz.test',SETTINGS_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
 db=await mf.getD1Database('DB');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').filter(Boolean))await db.prepare(statement).run();
});after(async()=>mf?.dispose());
test('cloud accounts persist, require identity, and isolate owner settings',async()=>{
 let r=await call('/auth/register',{method:'POST',body:{name:'Patient',email:'patient@radaz.test',password:pass,role:'patient'}});assert.equal(r.status,201);patientCookie=r.cookie;
 r=await call('/auth/login',{method:'POST',body:{email:'patient@radaz.test',password:pass}});assert.equal(r.status,200);assert.equal((await call('/auth/me',{cookie:r.cookie})).data.user.name,'Patient');
 r=await call('/auth/register',{method:'POST',body:{name:'Doctor',email:'doctor@radaz.test',password:pass,role:'doctor'}});assert.equal(r.status,201);doctorCookie=r.cookie;doctorId=r.data.user.id;
 assert.equal((await call('/admin/payment-settings',{cookie:doctorCookie})).status,403);
 assert.equal((await call('/auth/owner',{method:'POST',body:{}})).status,403);
 r=await call('/auth/owner',{method:'POST',body:{},headers:{'oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'owner@radaz.test'}});assert.equal(r.status,200);ownerCookie=r.cookie;
 assert.equal((await call('/admin/payment-settings',{method:'PUT',cookie:ownerCookie,body:{provider:'epoint',environment:'test',currency:'AZN',merchant_id:'test-public',secret_key:'test-private'}})).status,200);
 r=await call('/admin/payment-settings',{cookie:ownerCookie});assert.equal(r.data.secrets.secret_key,true);assert.equal(JSON.stringify(r.data).includes('test-private'),false);
 const stored=await db.prepare("SELECT value FROM settings WHERE name='payment'").first();assert.equal(stored.value.includes('test-private'),false);
 assert.equal((await call('/admin/site-settings',{method:'PUT',cookie:ownerCookie,body:{call_center:'*006',phone:'+994 00 000 00 00'}})).status,200);
 assert.equal((await call('/config')).data.contact.call_center,'*006');
 assert.equal((await call('/admin/site-settings',{method:'PUT',cookie:ownerCookie,body:{call_center:'*006',phone:''},headers:{Origin:'https://evil.test'}})).status,403);
 await call('/admin/approve',{method:'POST',cookie:ownerCookie,body:{kind:'doctor',id:doctorId}});
 await call('/me/profile',{method:'PUT',cookie:doctorCookie,body:{price:45,name:'Doctor'}});
 r=await call('/auth/register',{method:'POST',body:{name:'Other patient',email:'other@radaz.test',password:pass,role:'patient'}});otherCookie=r.cookie;
});
test('streamed R2 upload, capacity and private case access',async()=>{
 const slot=await call('/me/availability',{method:'POST',cookie:doctorCookie,body:{date:'2026-11-01',time:'09:00–11:00',capacity:1}});assert.equal(slot.status,201);
 const bytes=Buffer.from('PK\x03\x04DICOM archive fixture');
 let r=await call('/uploads',{method:'POST',cookie:patientCookie,body:{size:bytes.length}});assert.equal(r.status,201);const upload=r.data.id;
 r=await call('/uploads/'+upload+'/parts/1',{method:'PUT',cookie:patientCookie,raw:bytes,headers:{'Content-Length':String(bytes.length)}});assert.equal(r.status,200);
 assert.equal((await call('/uploads/'+upload+'/complete',{method:'POST',cookie:patientCookie,body:{}})).status,200);
 const payload={archive_id:upload,doctor_id:doctorId,slot_id:slot.data.id,consent:true,patient:{first_name:'Test',last_name:'Case',email:'patient@radaz.test',phone:'000000',complaints:'Fixture'},metadata:{modality:'CT'}};
 r=await call('/consultations',{method:'POST',cookie:patientCookie,body:payload});assert.equal(r.status,201,JSON.stringify(r.data));caseId=r.data.case.id;receipt=r.data.token;assert.equal(r.data.case.payment_status,'demo');assert.equal(Date.parse(r.data.case.response_due_at)-Date.parse(r.data.case.created_at),7200000);
 assert.equal((await call('/consultations',{method:'POST',cookie:patientCookie,body:payload})).status,400);
 assert.equal((await call('/cases/'+caseId,{cookie:otherCookie})).status,403);
 assert.equal((await call('/me/cases',{cookie:doctorCookie})).data.length,1);
 assert.equal((await call('/me/cases',{cookie:patientCookie})).data.length,1);
});
test('rich templates, optimistic reports, and one-use viewer launch',async()=>{
 let r=await call('/x/templates',{method:'POST',cookie:doctorCookie,body:{title:'CT template',lang:'az',modality:'CT',html:'<p><strong>Finding</strong><script>bad()</script></p>'}});assert.equal(r.status,200);assert.equal(r.data.html,'<p><strong>Finding</strong></p>');
 r=await call('/cases/'+caseId+'/report',{method:'PUT',cookie:doctorCookie,body:{html:'<p>Draft</p>',version:0}});assert.equal(r.status,200);
 assert.equal((await call('/cases/'+caseId,{cookie:patientCookie})).data.report,'');
 assert.equal((await call('/cases/'+caseId+'/report',{method:'PUT',cookie:doctorCookie,body:{html:'old',version:0}})).status,409);
 assert.equal((await call('/cases/'+caseId+'/report',{method:'PUT',cookie:patientCookie,body:{html:'bad',version:1}})).status,403);
 r=await call('/cases/'+caseId+'/report',{method:'PUT',cookie:doctorCookie,body:{html:'<p>Final</p>',version:1,approve:true}});assert.equal(r.data.status,'approved');
 assert.equal((await call('/tracking',{method:'POST',body:{id:caseId,token:receipt}})).data.report,'<p>Final</p>');
 await call('/admin/viewer-settings',{method:'PUT',cookie:ownerCookie,body:{web_url:'https://viewer.radaz.test/'}});
 r=await call('/cases/'+caseId+'/viewer-launch',{method:'POST',cookie:doctorCookie,body:{}});assert.equal(r.status,200);const ticket=new URLSearchParams(new URL(r.data.url).hash.slice(1)).get('radaz-ticket');
 let res=await mf.dispatchFetch(base+'/api/viewer/redeem',{method:'POST',headers:{Origin:'https://viewer.radaz.test','Content-Type':'application/json'},body:JSON.stringify({ticket})});assert.equal(res.status,200);assert.match(await res.text(),/^PK/);
 assert.equal((await call('/viewer/redeem',{method:'POST',body:{ticket},headers:{Origin:'https://viewer.radaz.test'}})).status,403);
 assert.equal((await call('/payments/callback',{method:'POST',raw:'data=e30=&signature=wrong'})).status,403);
});
test('payment confirmation rejects changed amounts and is idempotent',async()=>{
 const s=dbTools(db),data=Buffer.from(JSON.stringify({order_id:'pay-fixture'})).toString('base64');assert.equal(verifySignature('key',data,epointSignature('key',data)),true);assert.equal(verifySignature('other',data,epointSignature('key',data)),false);
 await s.put('case',doctorId,{id:'payment-case',doctor_id:doctorId,price:45,status:'awaiting_payment',payment_status:'awaiting_payment',created_at:new Date().toISOString()});
 await s.run('INSERT INTO payments VALUES(?,?,?,?,?,?,?)','pay-fixture','payment-case',4500,'AZN','pending','trx-fixture',new Date().toISOString());
 const p=await s.first('SELECT * FROM payments WHERE id=?','pay-fixture');
 await assert.rejects(()=>settle(s,p,{order_id:p.id,transaction:p.transaction_id,status:'success',amount:'0.01'}));
 await settle(s,p,{order_id:p.id,transaction:p.transaction_id,status:'success',amount:'45.00',currency:'AZN'});
 const first=await s.get('payment-case','case');assert.equal(first.payment_status,'paid');
 await settle(s,p,{order_id:p.id,transaction:p.transaction_id,status:'success',amount:'45.00',currency:'AZN'});assert.equal((await s.get('payment-case','case')).response_due_at,first.response_due_at);
});

test('earning rules enforce cents, percentage bounds and Baku date boundaries',()=>{
 assert.equal(calculate(4501,parseRule({mode:'percentage',value:'33.33'})),1500);
 assert.equal(calculate(4501,parseRule({mode:'fixed',value:'17.25'})),1725);
 for(const v of ['100.01','-1','NaN','2.001'])assert.throws(()=>parseRule({mode:'percentage',value:v}));
 const r=dateRange('2026-10-01','2026-10-31');assert.equal(r.start,'2026-09-30T20:00:00.000Z');assert.equal(r.end,'2026-10-31T20:00:00.000Z');
 for(const pair of [['2026-02-30','2026-03-01'],['2026-13-01','2027-01-01'],['2026-10-02','2026-10-01']])assert.throws(()=>dateRange(...pair),{status:400});
});

test('doctor earnings accrue once, preserve snapshots, exclude demo and isolate reports',async()=>{
 const s=dbTools(db),path='/admin/earning-rules';
 assert.equal((await call(path,{cookie:patientCookie})).status,403);
 assert.equal((await call(path,{method:'PUT',cookie:doctorCookie,body:{mode:'fixed',value:'100'}})).status,403);
 let r=await call(path,{method:'PUT',cookie:ownerCookie,body:{mode:'percentage',value:'60'}});assert.equal(r.status,200);
 async function paidCase(cid,amount){await s.put('case',doctorId,{id:cid,doctor_id:doctorId,user_id:'fixture-patient',price:999,status:'pending',payment_status:'paid',created_at:new Date().toISOString(),version:0});await s.run('INSERT INTO payments VALUES(?,?,?,?,?,?,?)','pay-'+cid,cid,amount,'AZN','paid','trx-'+cid,new Date().toISOString());return call('/cases/'+cid+'/report',{method:'PUT',cookie:doctorCookie,body:{html:'<p>Approved fixture</p>',version:0,approve:true}});}
 r=await paidCase('earned-percentage',4501);assert.equal(r.status,200);assert.equal((await s.first('SELECT * FROM earnings WHERE case_id=?','earned-percentage')).amount,2701);
 assert.equal((await s.first('SELECT COUNT(*) AS n FROM earnings WHERE case_id=?',caseId)).n,0,'demo report must not accrue');
 assert.equal((await call('/cases/earned-percentage/report',{method:'PUT',cookie:doctorCookie,body:{html:'<p>Again</p>',version:1,approve:true}})).status,409);
 await call(path,{method:'PUT',cookie:ownerCookie,body:{doctor_id:doctorId,mode:'fixed',value:'17.25'}});
 assert.equal((await paidCase('earned-fixed',4500)).status,200);
 assert.equal((await s.first('SELECT amount FROM earnings WHERE case_id=?','earned-fixed')).amount,1725);
 assert.equal((await s.first('SELECT amount FROM earnings WHERE case_id=?','earned-percentage')).amount,2701,'historical percentage preserved');
 await s.run('UPDATE earnings SET earned_at=? WHERE case_id=?','2026-09-30T20:00:00.000Z','earned-percentage');
 await s.run('UPDATE earnings SET earned_at=? WHERE case_id=?','2026-10-31T19:59:59.999Z','earned-fixed');
 const q='?from=2026-10-01&to=2026-10-31';r=await call('/admin/earnings'+q,{cookie:ownerCookie});assert.deepEqual(r.data.total,{count:2,gross:9001,amount:4426,platform:4575,unallocated:0});
 assert.equal((await call('/admin/earnings'+q,{cookie:doctorCookie})).status,403);
 assert.equal((await call('/me/earnings'+q,{cookie:patientCookie})).status,403);
 r=await call('/me/earnings'+q+'&doctor=someone-else',{cookie:doctorCookie});assert.equal(r.data.doctor_id,doctorId);assert.equal(r.data.total.amount,4426);
 await s.run('UPDATE earnings SET earned_at=? WHERE case_id=?','2026-10-31T20:00:00.000Z','earned-fixed');
 assert.equal((await call('/admin/earnings'+q,{cookie:ownerCookie})).data.total.count,1,'November midnight is excluded');
 await s.run("UPDATE payments SET state='refunded' WHERE case_id='earned-percentage'");
 assert.equal((await call('/admin/earnings'+q,{cookie:ownerCookie})).data.total.count,0,'refunded payment excluded');
 await s.run('DELETE FROM earning_rules');
 assert.equal((await paidCase('earned-unallocated',5000)).status,200,'clinical approval works before financial configuration');
 assert.equal((await s.first("SELECT amount FROM earnings WHERE case_id='earned-unallocated'")).amount,null);
 await call(path,{method:'PUT',cookie:ownerCookie,body:{mode:'percentage',value:'40'}});
 r=await call('/admin/earnings/allocate',{method:'POST',cookie:ownerCookie,body:{doctor_id:doctorId}});assert.equal(r.data.count,1);
 assert.equal((await s.first("SELECT amount FROM earnings WHERE case_id='earned-unallocated'")).amount,2000);
 assert.equal((await s.first("SELECT amount FROM earnings WHERE case_id='earned-fixed'")).amount,1725);
 assert.equal((await call('/admin/earnings/allocate',{method:'POST',cookie:ownerCookie,body:{doctor_id:doctorId}})).data.count,0);
 assert.equal((await call('/admin/overview',{cookie:ownerCookie})).status,200);
});

