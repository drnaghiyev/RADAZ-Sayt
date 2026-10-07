import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { readFileSync, mkdirSync, existsSync, unlinkSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, safeUser, passwordHash, passwordMatches, id, token, hash, now, cleanHtml } from './store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=(status,detail)=>Object.assign(new Error(detail),{status});
const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const groups=['CT','MR','CR','US'];
const secretFields=['api_key','secret_key','webhook_secret'];
const bankFields=['provider','environment','merchant_id','bank_name','account_holder','iban','swift','tax_id','currency','notes'];
const catalogDefault={prices:{xray:90,usm:70,ecg:35,video:40},zones:['Bakı','Abşeron'],home_capacity:2,commission:0,report_hours:24,plan:'clinic',plan_expires:'',slots:['09:00–11:00','11:00–13:00','14:00–16:00','16:00–18:00']};

export function createApp(options={}) {
  const origin=new URL(options.origin||process.env.PUBLIC_ORIGIN||'http://127.0.0.1:5188').origin;
  const secure=new URL(origin).protocol==='https:';
  if ((options.production??process.env.NODE_ENV==='production')&&!secure) throw Error('Production PUBLIC_ORIGIN must use HTTPS.');
  const directory=path.resolve(options.dataDir||process.env.DATA_DIR||path.join(root,'data'));
  const store=openStore(directory,options.encryptionKey||process.env.SETTINGS_ENCRYPTION_KEY);
  const files=path.join(directory,'archives'); mkdirSync(files,{recursive:true,mode:0o700});
  const upload=multer({dest:files,limits:{fileSize:256*1024*1024,files:1,fields:5,fieldSize:128*1024}});
  const app=express(); app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'unsafe-inline'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],mediaSrc:["'self'",'data:','blob:'],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'self'"],upgradeInsecureRequests:secure?[]:null}},crossOriginEmbedderPolicy:false,strictTransportSecurity:secure?undefined:false,referrerPolicy:{policy:'no-referrer'}}));
  app.use(express.json({limit:'256kb'}));
  app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store'); next();});
  const viewer=()=>store.setting('viewer',{web_url:options.viewerUrl||process.env.RADAZ_VIEWER_URL||'',desktop_enabled:process.env.RADAZ_DESKTOP_ENABLED==='true'});
  function allowedViewerOrigin(){try{return new URL(viewer().web_url,origin).origin;}catch{return '';}}
  app.use('/api/viewer/redeem',(req,res,next)=>{
    const requested=req.get('Origin');
    if(requested&&requested!==origin&&requested!==allowedViewerOrigin())return next(fail(403,'Viewer mənbəyinə icazə verilmir.'));
    if(requested){res.set('Access-Control-Allow-Origin',requested);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Content-Type, X-RADAZ-CLIENT');res.set('Access-Control-Allow-Methods','POST, OPTIONS');}
    if(req.method==='OPTIONS')return res.sendStatus(204); next();
  });
  app.use('/api',(req,res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.path!=='/viewer/redeem'){
      if(req.get('Origin')!==origin||req.get('X-RADAZ-CLIENT')!=='web')return next(fail(403,'Sorğunun mənbəyi təsdiqlənmədi.'));
    }
    const session=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('radaz_session='))?.slice(14);
    if(session){const row=store.db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.digest=? AND sessions.expires>?').get(hash(session),Date.now());req.user=safeUser(row);req.sessionDigest=hash(session);}
    next();
  });
  const auth=(...roles)=>(req,res,next)=>!req.user?next(fail(401,'Əvvəlcə daxil olun.')):roles.length&&!roles.includes(req.user.role)?next(fail(403,'Bu bölməyə girişiniz yoxdur.')):next();
  const owner=(req,res,next)=>req.user?.role==='admin'&&req.user.id===store.setting('owner_id')?next():next(fail(req.user?403:401,'Bu ayarları yalnız saytın sahib administratoru aça bilər.'));
  const doctor=(req,res,next)=>req.user?.role==='doctor'&&req.user.approved?next():next(fail(req.user?403:401,'Təsdiqlənmiş radioloq hesabı tələb olunur.'));
  function limit(req,key,max,seconds=900){
    const k=key+':'+req.ip, t=Date.now();
    store.db.prepare('DELETE FROM rate_limits WHERE expires<?').run(t);
    store.db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(k,t+seconds*1000);
    if(store.db.prepare('SELECT count FROM rate_limits WHERE key=?').get(k).count>max)throw fail(429,'Sorğu limiti aşılıb. Bir qədər sonra yenidən sınayın.');
  }
  function session(res,userId){const value=token(); store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(value),userId,Date.now()+8*3600000);res.cookie('radaz_session',value,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:8*3600000});}
  const userRow=userId=>store.db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  function caseFor(req,caseId,guest=false){
    const c=store.get(caseId,'case');
    const canDoctor=req.user?.role==='doctor'&&req.user.approved&&c?.doctor_id===req.user.id;
    const canOwner=req.user?.id===store.setting('owner_id');
    const canGuest=guest&&c&&req.get('X-Case-Token')&&hash(req.get('X-Case-Token'))===c.token_hash;
    if(!c||!(canDoctor||canOwner||canGuest))throw fail(req.user||req.get('X-Case-Token')?403:401,'Müraciətə giriş yoxdur.');
    return c;
  }
  const publicCase=c=>{const {token_hash,archive_path,...value}=c;return value;};
  function available(s){const count=store.records('case').filter(c=>c.slot_id===s.id&&c.status!=='cancelled').length;return {...s,remaining:Math.max(0,s.capacity-count)};}
  function publicDoctor(row){const d=safeUser(row);const {email,role,...profile}=d;return {...profile,specialty:'Radioloq',focus:profile.focus||'Ümumi radiologiya',price:profile.price||0,experience:profile.experience||0,tone:0,clinic:profile.clinic||'',certificates:profile.certificates||[],gallery:profile.gallery||[],languages:profile.languages||'Azərbaycan',demo:false};}
  app.get('/api/config',(req,res)=>res.json({radaz:true,demo_mode:false,production:true,viewer_path:viewer().web_url,desktop_enabled:viewer().desktop_enabled,owner_initialized:!!store.setting('owner_id'),payments_enabled:false}));
  app.get('/api/health',(req,res)=>{store.db.prepare('SELECT 1').get();res.json({ok:true});});
  app.get('/api/auth/me',(req,res)=>res.json({user:req.user||null}));
  app.post('/api/auth/login',async(req,res)=>{
    limit(req,'login',15);const email=text(req.body.email).toLowerCase(),pw=String(req.body.password||'');
    if(pw.length>1024)throw fail(400,'Giriş məlumatları düzgün deyil.');
    const row=store.db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(!await passwordMatches(pw,row?.password))throw fail(401,'Email və ya şifrə düzgün deyil.');
    session(res,row.id);store.audit(row.id,'login');res.json({user:safeUser(row)});
  });
  app.post('/api/auth/logout',(req,res)=>{if(req.sessionDigest)store.db.prepare('DELETE FROM sessions WHERE digest=?').run(req.sessionDigest);res.clearCookie('radaz_session',{httpOnly:true,secure,sameSite:'strict',path:'/'});res.json({ok:true});});
  app.post('/api/auth/register',async(req,res)=>{
    limit(req,'register',10,3600); const {role}=req.body,email=text(req.body.email).toLowerCase(),password=String(req.body.password||''),name=text(req.body.name);
    if(!['doctor','clinic'].includes(role)||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||password.length>1024||!name)throw fail(400,'Ad, düzgün email, hesab növü və ən az 12 simvolluq şifrə daxil edin.');
    if(store.db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail(409,'Bu email ilə qeydiyyat mövcuddur.');
    const uid=id('user');store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(uid,email,await passwordHash(password),role,0,JSON.stringify({name,clinic:text(req.body.clinic)}),now());session(res,uid);res.status(201).json({user:safeUser(userRow(uid))});
  });
  app.post('/api/demo/login',(req,res)=>{throw fail(404,'Real saytda demo giriş aktiv deyil.');});
  app.get('/api/doctors',(req,res)=>res.json(store.db.prepare("SELECT * FROM users WHERE role='doctor' AND approved=1").all().map(publicDoctor)));
  app.get('/api/slots',(req,res)=>res.json(store.records('slot').filter(s=>s.date===req.query.date&&userRow(s.doctor_id)?.approved).map(available)));
  app.get('/api/me/profile',auth('doctor'),(req,res)=>res.json({...publicDoctor(userRow(req.user.id)),email:req.user.email}));
  app.put('/api/me/profile',auth('doctor'),(req,res)=>{
    const old=JSON.parse(userRow(req.user.id).profile), value={...old};
    for(const key of ['name','focus','clinic','about','education','courses','languages','phone'])if(key in req.body)value[key]=text(req.body[key],key==='about'?10000:1000);
    for(const key of ['price','experience'])if(key in req.body){const n=Number(req.body[key]);if(!Number.isFinite(n)||n<0||n>10000)throw fail(400,'Rəqəm düzgün deyil.');value[key]=n;}
    store.db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify(value),req.user.id);res.json({...publicDoctor(userRow(req.user.id)),email:req.user.email});
  });
  app.get('/api/me/availability',auth('doctor'),(req,res)=>res.json(store.records('slot',req.user.id).map(available)));
  app.post('/api/me/availability',doctor,(req,res)=>{const d=req.body;if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(d.time)||!Number.isInteger(d.capacity)||d.capacity<1||d.capacity>100)throw fail(400,'Qəbul intervalı düzgün deyil.');if(store.records('slot',req.user.id).some(s=>s.date===d.date&&s.time===d.time))throw fail(409,'Bu interval mövcuddur.');res.status(201).json(store.put('slot',req.user.id,{id:id('slot'),doctor_id:req.user.id,date:d.date,time:d.time,capacity:d.capacity}));});
  app.delete('/api/me/availability/:id',doctor,(req,res)=>{const s=store.get(req.params.id,'slot');if(!s||s.doctor_id!==req.user.id)throw fail(404,'Interval tapılmadı.');if(available(s).remaining<s.capacity)throw fail(409,'Müraciəti olan interval silinə bilməz.');store.remove(s.id,'slot',req.user.id);res.json({ok:true});});
  app.get('/api/admin/pending',owner,(req,res)=>res.json({doctors:store.db.prepare("SELECT * FROM users WHERE role='doctor' AND approved=0").all().map(publicDoctor),clinics:store.records('clinic').filter(c=>c.status==='pending')}));
  app.post('/api/admin/approve',owner,(req,res)=>{const {kind,id:uid}=req.body;if(kind==='doctor'){const row=userRow(uid);if(row?.role!=='doctor')throw fail(404,'Həkim tapılmadı.');store.db.prepare('UPDATE users SET approved=1 WHERE id=?').run(uid);}else if(kind==='clinic'){const c=store.get(uid,'clinic');if(!c)throw fail(404,'Klinika tapılmadı.');store.put('clinic',c.owner_id,{...c,status:'approved'});}else throw fail(400,'Növ düzgün deyil.');store.audit(req.user.id,'registration_approved',uid);res.json({ok:true});});
  app.get('/api/admin/payment-settings',owner,(req,res)=>{const value=store.unseal('payment');const secrets=Object.fromEntries(secretFields.map(key=>[key,!!value[key]]));for(const key of secretFields)delete value[key];res.json({values:value,secrets,configured:Object.keys(value).length>0,charging_enabled:false});});
  app.put('/api/admin/payment-settings',owner,(req,res)=>{
    const old=store.unseal('payment'),value={...old};
    for(const key of bankFields)if(key in req.body)value[key]=text(req.body[key],key==='notes'?2000:300);
    if(!['unconfigured','bank_transfer','epoint','other'].includes(value.provider)||!['test','live'].includes(value.environment)||!['AZN','USD','EUR'].includes(value.currency))throw fail(400,'Ödəniş parametrləri düzgün deyil.');
    for(const key of secretFields){if(req.body.clear_secrets?.includes(key))delete value[key];else if(typeof req.body[key]==='string'&&req.body[key].trim())value[key]=text(req.body[key],4096);}
    value.updated_at=now();store.seal('payment',value);store.audit(req.user.id,'payment_settings_updated');res.json({ok:true,charging_enabled:false});
  });
  app.get('/api/admin/viewer-settings',owner,(req,res)=>res.json(viewer()));
  app.put('/api/admin/viewer-settings',owner,(req,res)=>{
    const web_url=text(req.body.web_url,2000);let target;
    if(web_url){try{target=new URL(web_url,origin);}catch{throw fail(400,'Viewer ünvanı düzgün deyil.');}if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.hash||target.search||(target.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(target.hostname)))throw fail(400,'HTTPS ünvanı və ya lokal RADAZ ünvanı daxil edin.');}
    const value={web_url:web_url?target.href:'',desktop_enabled:req.body.desktop_enabled===true};store.set('viewer',value);store.audit(req.user.id,'viewer_settings_updated');res.json(value);
  });
  app.get('/api/me/cases',doctor,(req,res)=>res.json(store.records('case',req.user.id).map(publicCase)));
  app.get('/api/cases/:id',auth(),(req,res)=>res.json(publicCase(caseFor(req,req.params.id))));
  app.post('/api/consultations',(req,res,next)=>{limit(req,'consultation',12,3600);next();},upload.single('archive'),(req,res)=>{
    try{
      let d;try{d=JSON.parse(req.body.payload||'{}');}catch{throw fail(400,'Müraciət məlumatı oxunmadı.');}
      const patient=d.patient||{};if(!d.consent||!text(patient.first_name)||!text(patient.last_name)||!/^\S+@\S+\.\S+$/.test(patient.email||'')||!text(patient.phone)||!text(patient.complaints))throw fail(400,'Pasiyent məlumatlarını və razılığı tamamlayın.');
      if(d.sample||!req.file)throw fail(400,'Real saytda DICOM arxivi tələb olunur.');
      const signature=Buffer.alloc(4),fd=openSync(req.file.path,'r');try{readSync(fd,signature,0,4,0);}finally{closeSync(fd);}if(signature[0]!==0x50||signature[1]!==0x4b)throw fail(400,'ZIP arxivi seçin.');
      const receipt=token(),caseId=id('RZ');
      const c=store.transaction(()=>{
        const sl=store.get(d.slot_id,'slot'),dr=userRow(d.doctor_id);if(!sl||sl.doctor_id!==d.doctor_id||!dr?.approved||available(sl).remaining<1)throw fail(409,'Seçilmiş vaxt dolub və ya mövcud deyil.');
        const p=Object.fromEntries(['first_name','last_name','father_name','birth_date','email','phone','complaints','language','report_language'].map(k=>[k,text(patient[k],k==='complaints'?10000:250)]));
        const value={id:caseId,doctor_id:dr.id,slot_id:sl.id,patient:p,report_date:sl.date,time:sl.time,price:JSON.parse(dr.profile).price||0,status:'pending',payment_status:'not_charged',sample:false,created_at:now(),archive_path:path.basename(req.file.path),file_name:caseId+'.zip',file_size:req.file.size,token_hash:hash(receipt),report:'',version:0,metadata:{modality:text(d.metadata?.modality,20),patient_id:text(d.metadata?.patient_id,100),dicom_count:Number(d.metadata?.dicom_count)||0}};
        store.put('case',dr.id,value);store.audit('guest','consultation_created',caseId);return value;
      });res.status(201).json({case:publicCase(c),token:receipt});
    }catch(error){if(req.file?.path&&existsSync(req.file.path))unlinkSync(req.file.path);throw error;}
  });
  app.put('/api/cases/:id/report',doctor,(req,res)=>{
    const value=store.transaction(()=>{const c=caseFor(req,req.params.id);if(['approved','sent'].includes(c.status))throw fail(409,'Təsdiqlənmiş hesabat kilidlənib.');if(req.body.version!==c.version)throw fail(409,'Hesabat başqa pəncərədə dəyişib. Yeniləyib davam edin.');const html=cleanHtml(req.body.html);if(req.body.approve&&!sanitizeText(html))throw fail(400,'Boş hesabat təsdiqlənə bilməz.');c.report=html;c.version++;c.status=req.body.approve?'approved':'in_review';if(req.body.approve)c.approved_at=now();store.put('case',c.doctor_id,c);store.put('version',c.id,{id:id('version'),case_id:c.id,version:c.version,html,status:c.status,created_at:now()});store.audit(req.user.id,req.body.approve?'report_approved':'report_saved',c.id);return c;});res.json(publicCase(value));
  });
  app.get('/api/cases/:id/archive',auth(),(req,res)=>{const c=caseFor(req,req.params.id);store.audit(req.user.id,'archive_opened',c.id);res.download(path.join(files,c.archive_path),c.file_name);});
  app.post('/api/cases/:id/viewer-launch',doctor,(req,res)=>{
    const c=caseFor(req,req.params.id), settings=viewer();if(!settings.web_url)throw fail(409,'Administrator RADAZ ünvanını hələ qoşmayıb.');
    if(!c.archive_path)throw fail(404,'Bu müraciətdə DICOM arxivi yoxdur.');
    const launch=token(),target=new URL(settings.web_url,origin);store.db.prepare('DELETE FROM launches WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO launches VALUES(?,?,?,?,?)').run(hash(launch),c.id,req.user.id,target.origin,Date.now()+120000);
    target.hash=new URLSearchParams({'radaz-site':origin,'radaz-ticket':launch}).toString();
    const desktop=settings.desktop_enabled?'radaz://open?'+new URLSearchParams({url:target.href}).toString():null;
    store.audit(req.user.id,'viewer_launch_created',c.id);res.json({url:target.href,desktop_url:desktop,expires_in:120});
  });
  app.post('/api/viewer/redeem',(req,res)=>{
    limit(req,'viewer',60);const digest=hash(req.body.ticket||'');const grant=store.db.prepare('SELECT * FROM launches WHERE digest=? AND expires>?').get(digest,Date.now());
    if(!grant||!req.get('Origin')||![grant.origin,origin].includes(req.get('Origin')))throw fail(403,'Viewer keçidi etibarsızdır və ya vaxtı bitib.');
    const user=safeUser(userRow(grant.user_id)),c=store.get(grant.case_id,'case');if(!user?.approved||c?.doctor_id!==user.id)throw fail(403,'Müraciətə giriş yoxdur.');
    const deleted=store.db.prepare('DELETE FROM launches WHERE digest=? AND expires>?').run(digest,Date.now());if(deleted.changes!==1)throw fail(403,'Keçid artıq istifadə olunub.');
    store.audit(user.id,'viewer_archive_redeemed',c.id);res.type('application/zip');res.sendFile(path.join(files,c.archive_path));
  });
  app.post('/api/tracking',(req,res)=>{limit(req,'tracking',40);const c=store.get(text(req.body.id),'case');if(!c||hash(req.body.token||'')!==c.token_hash)throw fail(404,'Müraciət kodu və ya giriş açarı yanlışdır.');res.json({...publicCase(c),report:['approved','sent'].includes(c.status)?c.report:''});});
  app.get('/api/me/notifications',auth(),(req,res)=>res.json([]));
  app.get('/api/me/clinics',auth(),(req,res)=>res.json(store.records('clinic',req.user.id)));
  app.post('/api/clinics',auth('clinic','doctor'),(req,res)=>res.status(201).json(store.put('clinic',req.user.id,{id:id('clinic'),owner_id:req.user.id,name:text(req.body.name),address:text(req.body.address),phone:text(req.body.phone),status:'pending',connection:'not_configured'})));
  app.get('/api/x/catalog',(req,res)=>res.json(store.setting('catalog',catalogDefault)));
  app.put('/api/x/settings',owner,(req,res)=>{const value={...catalogDefault,...req.body};if(!value.prices||!Array.isArray(value.zones)||value.zones.length>30)throw fail(400,'Ayarlar düzgün deyil.');for(const n of Object.values(value.prices))if(!Number.isFinite(n)||n<0||n>10000)throw fail(400,'Qiymət düzgün deyil.');store.set('catalog',value);res.json(value);});
  app.get('/api/x/templates',doctor,(req,res)=>res.json(store.records('template',req.user.id)));
  const saveTemplate=(req,res)=>{const d=req.body,title=text(d.title,150);if(!title||!groups.includes(d.modality)||!['az','ru','en'].includes(d.lang))throw fail(400,'Şablon adı, dil və KT/MRT/Rentgen/USM qrupu seçin.');const old=req.params.id?store.get(req.params.id,'template'):null;if(req.params.id&&old?.owner!==req.user.id)throw fail(404,'Şablon tapılmadı.');const value={id:old?.id||id('template'),owner:req.user.id,title,lang:d.lang,modality:d.modality,html:cleanHtml(d.html),created_at:old?.created_at||now(),updated_at:now()};if(!sanitizeText(value.html))throw fail(400,'Şablonun mətnini daxil edin.');res.json(store.put('template',req.user.id,value));};
  app.post('/api/x/templates',doctor,saveTemplate);app.put('/api/x/templates/:id',doctor,saveTemplate);
  app.delete('/api/x/templates/:id',doctor,(req,res)=>{if(!store.remove(req.params.id,'template',req.user.id).changes)throw fail(404,'Şablon tapılmadı.');res.json({ok:true});});
  app.get('/api/x/security',auth(),(req,res)=>res.json({enabled:false,sessions:store.db.prepare('SELECT digest,expires FROM sessions WHERE user_id=?').all(req.user.id).map(s=>({id:s.digest.slice(0,16),current:s.digest===req.sessionDigest,expires_at:new Date(s.expires).toISOString()}))}));
  app.get('/api/x/cases/:id',auth(),(req,res)=>{const c=caseFor(req,req.params.id);res.json({messages:store.records('message',c.id),versions:store.records('version',c.id),addenda:[],critical:[],reviews:[],events:store.db.prepare('SELECT action AS kind,at AS created_at FROM audit WHERE target=? ORDER BY id').all(c.id),attachments:[],role:req.user.role,case_status:c.status});});
  app.post('/api/x/messages/:id',auth(),(req,res)=>{const c=caseFor(req,req.params.id);const message=text(req.body.text,6000);if(!message)throw fail(400,'Mesaj yazın.');res.json(store.put('message',c.id,{id:id('message'),author:req.user.name,actor:req.user.id,text:message,created_at:now()}));});
  app.get('/api/x/operations',auth(),(req,res)=>{const isOwner=req.user.id===store.setting('owner_id');res.json({orders:store.records('order').filter(o=>isOwner||o.doctor_id===req.user.id),cases:store.records('case').filter(c=>isOwner||c.doctor_id===req.user.id).map(publicCase),critical:[],reviews:[],teams:[],waitlist:[],refunds:[],settings:store.setting('catalog',catalogDefault),audit:isOwner?store.db.prepare('SELECT actor,action,target AS case_id,at FROM audit ORDER BY id DESC LIMIT 200').all():[]});});
  app.get('/api/x/slots',(req,res)=>{const c=store.setting('catalog',catalogDefault);res.json(c.slots.map(time=>({time,remaining:Math.max(0,c.home_capacity-store.records('order').filter(o=>o.date===req.query.date&&o.slot===time&&o.status!=='cancelled').length)})));});
  app.post('/api/x/orders',(req,res)=>{limit(req,'home-order',10,3600);const d=req.body;if(!d.consent||!text(d.name)||!text(d.phone)||!['xray','usm','ecg','video'].includes(d.service))throw fail(400,'Xidmət və əlaqə məlumatlarını tamamlayın.');const receipt=token(),value={id:id('HV'),kind:d.service==='video'?'video':'visit',service:d.service,date:text(d.date),slot:text(d.slot),doctor_id:text(d.doctor_id),status:'requested',version:0,data:Object.fromEntries(['name','phone','email','zone','address','floor','access','referral','notes','language','report_language'].map(k=>[k,text(d[k],2000)])),token_hash:hash(receipt),created_at:now()};store.put('order',value.doctor_id,value);const {token_hash,...order}=value;res.status(201).json({order,token:receipt});});
  app.get('/api/x/orders/:id',(req,res)=>{const o=store.get(req.params.id,'order');if(!o||!(req.user?.id===store.setting('owner_id')||req.user?.id===o.doctor_id||(req.get('X-Case-Token')&&hash(req.get('X-Case-Token'))===o.token_hash)))throw fail(403,'Sifarişə giriş yoxdur.');const {token_hash,...order}=o;res.json({order,events:[],messages:[]});});
  app.use('/api',(req,res)=>{throw fail(501,'Bu xidmət hələ qoşulmayıb. Heç bir əməliyyat icra edilmədi.');});
  app.get(['/', '/index.html'],(req,res)=>{res.set('Cache-Control','no-store');res.type('html').send(readFileSync(path.join(root,'dist/index.html'),'utf8').replace('window.RADAZ_STANDALONE=true;','window.RADAZ_STANDALONE=false;window.RADAZ_PRODUCTION=true;'));});
  app.use(express.static(path.join(root,'dist'),{index:false,dotfiles:'deny'}));
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.code==='LIMIT_FILE_SIZE'?413:error.status||500;res.status(status).json({detail:status===500?'Server əməliyyatı tamamlanmadı. Yenidən sınayın.':error.code==='LIMIT_FILE_SIZE'?'Arxiv 256 MB-dan böyükdür.':error.message});if(status===500)console.error('RADAZ request failed',error.name);});
  return {app,store};
}
function sanitizeText(html){return String(html).replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();}
