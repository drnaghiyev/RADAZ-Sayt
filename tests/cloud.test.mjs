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
 mf=new Miniflare({workers:[{name:'radaz',modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{TRUST_SITES_IDENTITY:'true',PUBLIC_ORIGIN:base,OWNER_PLATFORM_ID:'verified-owner',OWNER_EMAIL:'owner@radaz.test',SETTINGS_ENCRYPTION_KEY:randomBytes(32).toString('base64')}}]});
 db=await mf.getD1Database('DB');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').filter(Boolean))await db.prepare(statement).run();
});after(async()=>mf?.dispose());
test('cloud accounts persist, require identity, and isolate owner settings',async()=>{
 for(const role of ['patient','clinic','admin'])assert.equal((await call('/auth/register',{method:'POST',body:{name:'Blocked role',email:role+'@radaz.test',password:pass,role}})).status,400);
 let r=await call('/auth/guest',{method:'POST',body:{}});assert.equal(r.status,201);patientCookie=r.cookie;assert.equal((await call('/auth/me',{cookie:patientCookie})).data.user,null);
 r=await call('/auth/register',{method:'POST',body:{name:'Doctor',email:' Doctor@radaz.test ',password:pass,role:'doctor'}});assert.equal(r.status,201);doctorCookie=r.cookie;doctorId=r.data.user.id;
 await call('/auth/logout',{method:'POST',cookie:doctorCookie,body:{}});assert.equal((await call('/auth/me',{cookie:doctorCookie})).data.user,null);
 r=await call('/auth/login',{method:'POST',body:{email:'DOCTOR@radaz.test',password:pass}});assert.equal(r.status,200);doctorCookie=r.cookie;assert.equal((await call('/auth/me',{cookie:doctorCookie})).data.user.id,doctorId);
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
 r=await call('/auth/guest',{method:'POST',body:{}});otherCookie=r.cookie;
});
test('streamed R2 upload, capacity and private case access',async()=>{
 const slot=await call('/me/availability',{method:'POST',cookie:doctorCookie,body:{date:'2026-11-01',time:'09:00–11:00',capacity:1}});assert.equal(slot.status,201);
 const bytes=Buffer.from('PK\x03\x04DICOM archive fixture');
 let r=await call('/uploads',{method:'POST',cookie:patientCookie,body:{size:bytes.length}});assert.equal(r.status,201);const upload=r.data.id;
 r=await call('/uploads/'+upload+'/parts/1',{method:'PUT',cookie:patientCookie,raw:bytes,headers:{'Content-Length':String(bytes.length)}});assert.equal(r.status,200);
 assert.equal((await call('/uploads/'+upload+'/complete',{method:'POST',cookie:patientCookie,body:{}})).status,200);
 const payload={archive_id:upload,doctor_id:doctorId,slot_id:slot.data.id,consent:true,patient:{first_name:'Test',last_name:'Case',email:'patient@radaz.test',phone:'000000',complaints:'Fixture'},metadata:{modality:'CT'}};
 r=await call('/consultations',{method:'POST',cookie:patientCookie,body:payload});assert.equal(r.status,201,JSON.stringify(r.data));caseId=r.data.case.id;receipt=r.data.token;assert.equal(r.data.case.payment_status,'demo');assert.equal(r.data.case.response_due_at,null);assert.equal(r.data.case.status,'awaiting_payment');assert.equal((await call('/me/cases',{cookie:doctorCookie})).data.length,0);
 assert.equal((await call('/cases/'+caseId+'/demo-payment',{method:'POST',cookie:otherCookie,body:{}})).status,403);
 r=await call('/cases/'+caseId+'/demo-payment',{method:'POST',body:{},headers:{'X-Case-Token':receipt}});assert.equal(r.status,200);assert.equal(r.data.payment_status,'demo_paid');assert.equal(Date.parse(r.data.response_due_at)-Date.parse(r.data.paid_at),7200000);const due=r.data.response_due_at;assert.equal((await call('/cases/'+caseId+'/demo-payment',{method:'POST',cookie:patientCookie,body:{}})).data.response_due_at,due);
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

test('doctor clinics and individual earning rules cannot cross accounts',async()=>{
 let r=await call('/auth/register',{method:'POST',body:{name:'Second doctor',email:'second@radaz.test',password:pass,role:'doctor'}});assert.equal(r.status,201);const second=r.cookie,uid=r.data.user.id;
 assert.equal((await call('/clinics',{method:'POST',cookie:patientCookie,body:{name:'Forbidden'}})).status,403);
 r=await call('/clinics',{method:'POST',cookie:doctorCookie,body:{name:'Doctor clinic',address:'Baku',phone:'123456',owner_id:uid}});assert.equal(r.status,201);const clinic=r.data.id;assert.equal(r.data.owner_id,doctorId);
 assert.equal((await call('/me/clinics',{cookie:second})).data.length,0);
 for(const method of ['PUT','DELETE'])assert.equal((await call('/me/clinics/'+clinic,{method,cookie:second,body:{name:'Other'}})).status,404);
 r=await call('/clinics',{method:'POST',cookie:second,body:{name:'Second clinic'}});assert.equal(r.status,201,'unapproved doctor can complete own profile');
 assert.equal((await call('/me/clinics/'+clinic,{method:'PUT',cookie:doctorCookie,body:{name:'Renamed clinic',address:'Baku'}})).status,200);
 assert.equal((await call('/doctors')).data.find(d=>d.id===doctorId).clinics[0].name,'Renamed clinic');
 await call('/me/clinics/'+clinic,{method:'DELETE',cookie:doctorCookie,body:{}});assert.equal((await call('/me/clinics',{cookie:doctorCookie})).data.length,0);assert.equal((await call('/me/clinics',{cookie:second})).data.length,1);
 for(const [doctor_id,mode,value] of [[doctorId,'percentage','65'],[uid,'fixed','20']])assert.equal((await call('/admin/earning-rules',{method:'PUT',cookie:ownerCookie,body:{doctor_id,mode,value}})).status,200);
 const rules=(await call('/admin/earning-rules',{cookie:ownerCookie})).data;assert.equal(rules.default,null);assert.equal(rules.overrides.find(r=>r.doctor_id===doctorId).value,65);assert.equal(rules.overrides.find(r=>r.doctor_id===uid).value,20);
 assert.equal((await call('/x/cases/'+caseId,{cookie:patientCookie})).data.versions.length,0,'guest cannot read report drafts');
 assert.equal((await call('/cases/'+caseId+'/archive',{headers:{'X-Case-Token':receipt}})).status,401,'receipt grants do not expose image archives');
});

test('owner can securely create a password and sign in again without platform login',async()=>{
 assert.equal((await call('/me/password')).status,401);
 assert.equal((await call('/me/password',{cookie:ownerCookie})).data.has_password,false);
 assert.equal((await call('/auth/login',{method:'POST',body:{email:'owner@radaz.test',password:pass}})).status,409);
 assert.equal((await call('/me/password',{method:'PUT',cookie:ownerCookie,body:{password:pass,confirm_password:'different'}})).status,400);
 let r=await call('/me/password',{method:'PUT',cookie:ownerCookie,body:{password:pass,confirm_password:pass}});assert.equal(r.status,200);const old=ownerCookie;ownerCookie=r.cookie;
 assert.equal((await call('/auth/me',{cookie:old})).data.user,null);
 assert.equal((await call('/me/password',{cookie:ownerCookie})).data.has_password,true);
 assert.equal((await call('/me/password',{method:'PUT',cookie:ownerCookie,body:{password:pass,confirm_password:pass,current_password:'wrong'}})).status,403);
 r=await call('/auth/login',{method:'POST',body:{email:'OWNER@RADAZ.TEST',password:pass}});assert.equal(r.status,200);ownerCookie=r.cookie;assert.equal((await call('/admin/overview',{cookie:ownerCookie})).status,200);
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
 assert.equal((await call(path,{method:'PUT',cookie:ownerCookie,body:{mode:'fixed',value:'10'}})).status,400);
 let r=await call(path,{method:'PUT',cookie:ownerCookie,body:{doctor_id:doctorId,mode:'percentage',value:'60'}});assert.equal(r.status,200);
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
 await call(path,{method:'PUT',cookie:ownerCookie,body:{doctor_id:doctorId,mode:'percentage',value:'40'}});
 r=await call('/admin/earnings/allocate',{method:'POST',cookie:ownerCookie,body:{doctor_id:doctorId}});assert.equal(r.data.count,1);
 assert.equal((await s.first("SELECT amount FROM earnings WHERE case_id='earned-unallocated'")).amount,2000);
 assert.equal((await s.first("SELECT amount FROM earnings WHERE case_id='earned-fixed'")).amount,1725);
 assert.equal((await call('/admin/earnings/allocate',{method:'POST',cookie:ownerCookie,body:{doctor_id:doctorId}})).data.count,0);
 assert.equal((await call('/admin/overview',{cookie:ownerCookie})).status,200);
});

test('admin consultation price is authoritative and preserves existing case prices',async()=>{
 let r=await call('/admin/earning-rules',{method:'PUT',cookie:ownerCookie,body:{doctor_id:doctorId,consultation_price:'80.50',mode:'percentage',value:'70'}});assert.equal(r.status,200);
 assert.equal(r.data.doctors.find(d=>d.id===doctorId).consultation_price,80.5);
 assert.equal((await call('/me/profile',{method:'PUT',cookie:doctorCookie,body:{price:1}})).status,403);
 assert.equal((await call('/me/profile',{method:'PUT',cookie:doctorCookie,body:{price:80.5,name:'Doctor renamed'}})).status,200);
 assert.equal((await call('/cases/'+caseId,{cookie:doctorCookie})).data.price,45);
 assert.equal((await call('/me/earnings',{cookie:doctorCookie})).data.consultation_price,80.5);
 assert.equal((await call('/admin/earning-rules',{method:'PUT',cookie:ownerCookie,body:{doctor_id:doctorId,consultation_price:50,mode:'fixed',value:51}})).status,400);
 assert.equal((await call('/auth/local-setup',{method:'POST',body:{}})).status,404,'local bootstrap never exists on hosted site');
});

test('clinic intake keys are scoped, revocable and preserve incoming study revisions',async()=>{
 const c=(await call('/clinics',{method:'POST',cookie:doctorCookie,body:{name:'DICOM clinic'}})).data;
 const path='/me/clinics/'+c.id+'/connection';
 assert.equal((await call(path,{cookie:otherCookie})).status,403);
 let r=await call(path,{method:'PUT',cookie:doctorCookie,body:{enabled:true,ae_title:'RADAZ_SITE',dicom_port:11112,listen_host:'127.0.0.1',source_ae_titles:'CT_TEST',source_ips:'127.0.0.1'}});assert.equal(r.status,200);
 r=await call(path+'/key',{method:'POST',cookie:doctorCookie,body:{}});assert.equal(r.status,200);const key=r.data.key;
 assert.equal(JSON.stringify((await call(path,{cookie:doctorCookie})).data).includes(key),false);
 const ingest='/clinic-ingest/'+c.id,headers={Authorization:'Bearer '+key};
 assert.equal((await call(ingest+'/health',{headers})).status,200);
 assert.equal((await call('/admin/clinics',{headers})).status,401,'machine key does not grant admin access');
 const meta={study_uid:'1.2.3.4.5.6',patient_name:'Synthetic^Fixture',patient_id:'QA',modality:'CT',instances:1,manifest:'a'.repeat(64)},zip=Buffer.from('PK\x03\x04synthetic archive');
 const send=()=>call(ingest,{method:'POST',raw:zip,headers:{...headers,'Content-Length':String(zip.length),'X-RADAZ-Study':encodeURIComponent(JSON.stringify(meta))}});
 r=await send();assert.equal(r.status,200);const cid=r.data.id;assert.equal((await send()).data.duplicate,true);
 assert.equal((await call('/cases/'+cid,{cookie:doctorCookie})).data.payment_status,'clinic_unbilled');
 meta.manifest='b'.repeat(64);meta.instances=2;assert.equal((await send()).status,200);
 assert.equal((await call('/cases/'+cid,{cookie:doctorCookie})).data.metadata.dicom_count,2);
 await call('/cases/'+cid+'/report',{method:'PUT',cookie:doctorCookie,body:{html:'<p>Draft</p>',version:0}});
 meta.manifest='c'.repeat(64);assert.equal((await send()).status,409,'late images cannot overwrite an active report study');
 await call(path+'/key',{method:'POST',cookie:doctorCookie,body:{}});assert.equal((await call(ingest+'/health',{headers})).status,401,'rotated key is revoked');
 assert.equal((await call('/admin/clinics',{cookie:ownerCookie})).data.some(x=>x.id===c.id),true);
});

