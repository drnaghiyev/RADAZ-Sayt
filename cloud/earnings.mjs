import {fail,now} from './shared.mjs';

export function dateRange(from,to){
 const day=v=>{const d=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw fail(400,'Düzgün tarix seçin.');return Date.parse(v+'T00:00:00+04:00');};
 const start=day(from),end=day(to)+86400000;
 if(start>=end||end-start>366*86400000*10)throw fail(400,'Tarix aralığı düzgün deyil (maksimum 10 il).');
 return {from,to,start:new Date(start).toISOString(),end:new Date(end).toISOString(),timezone:'Asia/Baku'};
}
export function parseRule(d){
 if(!['percentage','fixed'].includes(d.mode)||!/^\d+(\.\d{1,2})?$/.test(String(d.value)))throw fail(400,'Faiz və ya sabit məbləği ən çox 2 onluq rəqəmlə daxil edin.');
 const value=Math.round(Number(d.value)*100);
 if(value<0||value>(d.mode==='percentage'?10000:1000000))throw fail(400,'Faiz 0–100, sabit məbləğ 0–10 000 AZN arasında olmalıdır.');
 return {mode:d.mode,value};
}
export const calculate=(gross,rule)=>rule.mode==='fixed'?rule.value:Math.round(gross*rule.value/10000);
const effective=(s,uid)=>s.first('SELECT * FROM earning_rules WHERE doctor_id=?',uid);

// Included in the report approval transaction. A unique case ID prevents double accrual.
export async function earningStatement(s,c){
 if(c.payment_status!=='paid')return null;
 const pay=await s.first("SELECT * FROM payments WHERE case_id=? AND state='paid' AND currency='AZN' ORDER BY created_at,id LIMIT 1",c.id);
 if(!pay)return null;
 const rule=await effective(s,c.doctor_id),amount=rule?calculate(pay.amount,rule):null;
 return s.db.prepare(`INSERT OR IGNORE INTO earnings(case_id,doctor_id,payment_id,gross,amount,mode,value,earned_at,allocated_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND kind='case' AND json_extract(value,'$.version')=? AND json_extract(value,'$.approved_at')=?)`)
 .bind(c.id,c.doctor_id,pay.id,pay.amount,amount,rule?.mode||'unconfigured',rule?.value??null,c.approved_at,rule?now():null,c.id,c.version,c.approved_at);
}
const people=s=>s.all("SELECT id,email,approved,json_extract(profile,'$.name') AS name FROM users WHERE role='doctor' OR (role='admin' AND CAST(json_extract(profile,'$.price') AS REAL)>0) ORDER BY name");
const ruleView=r=>r?{...r,value:r.value/100}:null;
export async function rules(s){return {default:null,doctors:await people(s),overrides:(await s.all("SELECT * FROM earning_rules WHERE doctor_id!='*'")).map(ruleView)};}
export async function report(s,url,doctorId){
 const today=new Date(Date.now()+4*3600000).toISOString().slice(0,10),range=dateRange(url.searchParams.get('from')||today.slice(0,7)+'-01',url.searchParams.get('to')||today);
 const selected=doctorId||url.searchParams.get('doctor')||'',args=[range.start,range.end,...(selected?[selected]:[])];
 // Reversed/cancelled payments and cases never contribute to current payable totals.
 const rows=await s.all(`SELECT e.*,json_extract(u.profile,'$.name') AS doctor_name FROM earnings e JOIN users u ON u.id=e.doctor_id JOIN payments p ON p.id=e.payment_id JOIN records r ON r.id=e.case_id
 WHERE e.earned_at>=? AND e.earned_at<? ${selected?'AND e.doctor_id=?':''} AND p.state='paid' AND json_extract(r.value,'$.payment_status')='paid' AND json_extract(r.value,'$.status') IN ('approved','sent') ORDER BY e.earned_at DESC,e.case_id`,...args);
 const total={count:0,gross:0,amount:0,platform:0,unallocated:0},groups=new Map();
 for(const r of rows){const g=groups.get(r.doctor_id)||{doctor_id:r.doctor_id,name:r.doctor_name,...total,count:0,gross:0,amount:0,platform:0,unallocated:0};if(!groups.has(r.doctor_id))groups.set(r.doctor_id,g);for(const t of [total,g]){t.count++;t.gross+=r.gross;if(r.amount===null)t.unallocated++;else{t.amount+=r.amount;t.platform+=r.gross-r.amount;}}}
 return {range,doctor_id:selected,total,doctors:doctorId?[]:await people(s),groups:[...groups.values()],entries:rows,rule:doctorId?ruleView(await effective(s,doctorId)):null};
}
export async function finances({s,p,method,url,user,auth,owner,body}){
 if(p==='/me/earnings'){auth('doctor','admin');if(!user.approved)throw fail(403,'Hesab təsdiqi tələb olunur.');return report(s,url,user.id);}
 if(!['/admin/overview','/admin/earning-rules','/admin/earnings','/admin/earnings/allocate'].includes(p))return undefined;
 owner();
 if(p==='/admin/overview'){
  const users=await s.all('SELECT role,approved,COUNT(*) AS count FROM users GROUP BY role,approved'),c=await s.first("SELECT COUNT(*) AS total,SUM(CASE WHEN json_extract(value,'$.status') IN ('pending','in_review') THEN 1 ELSE 0 END) AS waiting FROM records WHERE kind='case'");
  const monthly=await report(s,new URL(url.origin+'/api/admin/earnings'));
  return {users,cases:{total:c.total,waiting:c.waiting||0},monthly:monthly.total,range:monthly.range,pending:await s.all("SELECT id,email,json_extract(profile,'$.name') AS name FROM users WHERE role='doctor' AND approved=0 ORDER BY created_at")};
 }
 if(p==='/admin/earnings')return report(s,url);
 if(p==='/admin/earning-rules'){
  if(method==='GET')return rules(s);
  const d=await body(),uid=String(d.doctor_id||'');if(!uid||uid==='*')throw fail(400,'Qazanc qaydası üçün konkret həkim seçin.');
  if(uid!=='*'&&!await s.first("SELECT id FROM users WHERE id=? AND role IN ('doctor','admin')",uid))throw fail(404,'Həkim tapılmadı.');
  if(method==='DELETE'){if(uid==='*')throw fail(400,'Ümumi qayda silinə bilməz.');await s.run('DELETE FROM earning_rules WHERE doctor_id=?',uid);await s.audit(user.id,'earning-rule-removed',uid);return rules(s);}
  if(method!=='PUT')throw fail(405,'Əməliyyat dəstəklənmir.');
  const rule=parseRule(d),at=now();
  await s.db.batch([s.db.prepare('INSERT INTO earning_rules VALUES(?,?,?,?,?) ON CONFLICT(doctor_id) DO UPDATE SET mode=excluded.mode,value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(uid,rule.mode,rule.value,at,user.id),s.db.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').bind(user.id,'earning-rule-update',JSON.stringify({doctor_id:uid,...rule}),at)]);
  return rules(s);
 }
 if(p==='/admin/earnings/allocate'&&method==='POST'){
  const d=await body(),uid=String(d.doctor_id||'');if(!uid)throw fail(400,'Həkim seçin.');const rule=await effective(s,uid);if(!rule)throw fail(400,'Əvvəlcə qazanc qaydası təyin edin.');
  const result=await s.run(`UPDATE earnings SET amount=${rule.mode==='fixed'?'?':'CAST((gross * ? + 5000) / 10000 AS INTEGER)'},mode=?,value=?,allocated_at=? WHERE doctor_id=? AND amount IS NULL`,rule.value,rule.mode,rule.value,now(),uid);
  await s.audit(user.id,'earnings-allocate',JSON.stringify({doctor_id:uid,count:result.meta.changes,...rule}));return {count:result.meta.changes};
 }
 throw fail(405,'Əməliyyat dəstəklənmir.');
}
