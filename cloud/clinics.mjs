import {id,token,hash,now,text,fail} from './shared.mjs';
const defaults={ae_title:'RADAZ_SITE',listen_host:'127.0.0.1',dicom_port:11112,server_host:'',source_ae_titles:[],source_ips:[],enabled:false};
const safe=c=>{const {ingest_hash,...v}=c;return {...v,has_key:!!ingest_hash};};
export async function clinicApi({s,env,req,url,p,method,user,auth,body}){
 const admin=p==='/admin/clinics',base=p.match(/^\/(?:me|admin)\/clinics\/([^/]+)\/connection(?:\/(key|revoke))?$/);
 if(admin){auth('admin');return (await s.records('clinic')).filter(c=>c.status!=='inactive').map(safe);}
 if(!base)return undefined;
 auth('doctor','admin');const c=await s.get(base[1],'clinic');if(!c||c.status==='inactive'||user.role!=='admin'&&c.owner_id!==user.id)throw fail(404,'Klinika tapılmadı.');
 const settings={...defaults,...c.integration},view=()=>({clinic:safe(c),settings,endpoint:(env.PUBLIC_ORIGIN||url.origin)+'/api/clinic-ingest/'+c.id,has_key:!!c.ingest_hash,last_received_at:c.last_received_at||null});
 if(method==='GET')return view();
 if(base[2]){
  if(method!=='POST')throw fail(405,'Əməliyyat dəstəklənmir.');
  const key=base[2]==='key'?token():null;c.ingest_hash=key?hash(key):null;await s.run("UPDATE records SET value=json_set(value,'$.ingest_hash',?) WHERE id=? AND kind='clinic'",c.ingest_hash,c.id);await s.audit(user.id,key?'clinic_key_rotated':'clinic_key_revoked',c.id);return {...view(),...(key?{key}:{}),has_key:!!key};
 }
 if(method!=='PUT')throw fail(405,'Əməliyyat dəstəklənmir.');const d=await body();
 const ae=text(d.ae_title,16),port=Number(d.dicom_port),host=text(d.listen_host,100),server=text(d.server_host,253);
 const list=(v)=>String(v||'').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
 const aet=list(d.source_ae_titles),ips=list(d.source_ips);
 if(!/^[A-Za-z0-9_-]{1,16}$/.test(ae)||!Number.isInteger(port)||port<1024||port>65535||!/^([\d.]+|::1|localhost)$/.test(host)||aet.length>32||aet.some(v=>!/^[-A-Za-z0-9_ ]{1,16}$/.test(v))||ips.length>32||ips.some(v=>!/^([\da-fA-F:.]+)$/.test(v)))throw fail(400,'AE Title, port və IP siyahısını yoxlayın.');
 if(d.enabled&&!aet.length)throw fail(400,'Ən azı bir göndərən cihazın AE Title dəyərini yazın.');
 c.integration={ae_title:ae,listen_host:host,dicom_port:port,server_host:server,source_ae_titles:aet,source_ips:ips,enabled:d.enabled===true};c.updated_at=now();await s.run("UPDATE records SET value=json_set(value,'$.integration',json(?),'$.updated_at',?) WHERE id=? AND kind='clinic'",JSON.stringify(c.integration),c.updated_at,c.id);await s.audit(user.id,'clinic_connection_updated',c.id);return {...view(),settings:c.integration};
}

// A scoped machine key only accepts studies for this clinic. It is never a user session.
export async function ingest(req,env,url,s){
 const match=url.pathname.match(/^\/api\/clinic-ingest\/([^/]+)(?:\/(health))?$/);if(!match)throw fail(404,'Endpoint tapılmadı.');
 const c=await s.get(match[1],'clinic'),key=req.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!c||c.status==='inactive'||!c.integration?.enabled||!key||hash(key)!==c.ingest_hash)throw fail(401,'Klinika bağlantısı təsdiqlənmədi.');
 if(match[2]&&req.method==='GET')return {ok:true,clinic_id:c.id,ae_title:c.integration.ae_title};
 if(req.method!=='POST')throw fail(405,'Əməliyyat dəstəklənmir.');
 const bytes=Number(req.headers.get('Content-Length'));if(!Number.isInteger(bytes)||bytes<4||bytes>64*1024*1024)throw fail(413,'Göndəriş maksimum 64 MB ZIP olmalıdır.');
 let meta;try{meta=JSON.parse(decodeURIComponent(req.headers.get('X-RADAZ-Study')||''));}catch{throw fail(400,'Müayinə məlumatı oxunmadı.');}
 if(!/^[a-f0-9]{64}$/.test(meta.manifest||'')||!/^[\d.]{1,64}$/.test(meta.study_uid||'')||!text(meta.patient_name)||!Number.isInteger(meta.instances)||meta.instances<1)throw fail(400,'Study UID, pasiyent adı və fayl sayı tələb olunur.');
 const row=await s.first('SELECT * FROM users WHERE id=?',c.owner_id);if(!row?.approved)throw fail(403,'Klinikanın həkimi təsdiqlənməyib.');
 const cid='RZ-clinic-'+hash(c.id+':'+meta.study_uid).slice(0,32),existing=await s.get(cid,'case');
 if(existing?.archive_manifest===meta.manifest)return {id:cid,duplicate:true};
 if(existing&&(existing.version>0||existing.status!=='pending'))throw fail(409,'Yeni görüntülər gəlib, lakin rapor artıq açılıb. Lokal faylları saxlayın və həkimlə əlaqə saxlayın.');
 const archive=await req.arrayBuffer();if(archive.byteLength!==bytes||new Uint8Array(archive)[0]!==80||new Uint8Array(archive)[1]!==75)throw fail(400,'ZIP arxivi düzgün deyil.');
 const objectKey='archives/'+cid+'-'+meta.manifest+'.zip';await env.BUCKET.put(objectKey,archive,{httpMetadata:{contentType:'application/zip'}});
 const at=now(),name=text(meta.patient_name).replaceAll('^',' '),value={id:cid,user_id:c.owner_id,doctor_id:c.owner_id,clinic_id:c.id,clinic_name:c.name,source:'clinic',patient:{first_name:name,last_name:'',email:'',phone:'',complaints:text(meta.description,1000)||'Klinikadan göndərilmiş müayinə'},report_date:at.slice(0,10),time:'',price:JSON.parse(row.profile).price||0,status:'pending',payment_status:'clinic_unbilled',sample:false,created_at:at,response_due_at:null,archive_manifest:meta.manifest,archive_path:objectKey,file_name:cid+'.zip',file_size:bytes,report:'',version:0,metadata:{modality:text(meta.modality,20),patient_id:text(meta.patient_id,100),study_uid:meta.study_uid,dicom_count:meta.instances}};
 if(existing){const next={...existing,archive_manifest:meta.manifest,archive_path:objectKey,file_size:bytes,metadata:value.metadata,updated_at:at};const result=await s.run("UPDATE records SET value=? WHERE id=? AND json_extract(value,'$.version')=0 AND json_extract(value,'$.status')='pending' AND json_extract(value,'$.archive_manifest')=?",JSON.stringify(next),cid,existing.archive_manifest);if(!result.meta.changes)throw fail(409,'Rapor artıq açılıb. Yeni görüntülər lokal növbədə saxlanıldı.');}else {const inserted=await s.run('INSERT OR IGNORE INTO records VALUES(?,?,?,?,?)',cid,'case',c.owner_id,JSON.stringify(value),at);if(!inserted.meta.changes){const current=await s.get(cid,'case');if(current?.archive_manifest!==meta.manifest)throw fail(409,'Paralel göndəriş qəbul edilib. Yenidən göndərmə lokal növbədən aparılacaq.');}}
 await s.run("UPDATE records SET value=json_set(value,'$.last_received_at',?) WHERE id=? AND kind='clinic'",at,c.id);await s.audit(c.owner_id,'clinic_study_received',cid);return {id:cid,duplicate:false};
}
