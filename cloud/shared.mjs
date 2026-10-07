import { randomBytes, createHash, timingSafeEqual, webcrypto } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
const crypto=globalThis.crypto||webcrypto;
export const id=(p='id')=>p+'-'+randomBytes(16).toString('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const hash=v=>createHash('sha256').update(String(v)).digest('hex');
export const now=()=>new Date().toISOString();
export const text=(v,max=250)=>String(v??'').trim().slice(0,max);
export const fail=(status,detail)=>Object.assign(new Error(detail),{status});
export const cleanHtml=html=>sanitizeHtml(String(html||'').slice(0,100000),{allowedTags:['p','br','div','span','strong','b','em','i','u','s','h1','h2','h3','h4','ul','ol','li','blockquote','table','thead','tbody','tr','td','th','font'],allowedAttributes:{'*':['style'],font:['color','face','size'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedStyles:{'*':{'text-align':[/^(left|right|center|justify)$/],color:[/^#[0-9a-f]{3,8}$/i,/^rgb\([\d,\s]+\)$/],'font-weight':[/^(bold|normal|[1-9]00)$/],'font-style':[/^(italic|normal)$/],'text-decoration':[/^(underline|line-through)$/],'font-family':[/^[a-zA-Z ,"'-]+$/],'font-size':[/^\d{1,2}(px|pt)$/]}}});
async function derive(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(salt,'hex'),iterations:100000,hash:'SHA-256'},key,256));}
export async function passwordHash(p){const salt=randomBytes(16).toString('hex');return `pbkdf2$100000$${salt}$${(await derive(p,salt)).toString('hex')}`;}
export async function passwordMatches(p,stored){const [,,salt,expected]=(stored||'').split('$');const actual=await derive(String(p),salt||'00'.repeat(16)),check=Buffer.from(expected||'00'.repeat(32),'hex');return actual.length===check.length&&timingSafeEqual(actual,check)&&!!expected;}
async function aesKey(secret){const bytes=Buffer.from(secret||'','base64');if(bytes.length!==32)throw fail(503,'Serverin şifrələmə ayarı tamamlanmayıb.');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(secret,value){const iv=randomBytes(12);const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('RADAZ-payment-v1')},await aesKey(secret),new TextEncoder().encode(JSON.stringify(value)));return {iv:iv.toString('base64'),data:Buffer.from(bytes).toString('base64')};}
export async function unseal(secret,value){if(!value)return {};return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64'),additionalData:new TextEncoder().encode('RADAZ-payment-v1')},await aesKey(secret),Buffer.from(value.data,'base64'))));}
export function epointSignature(key,data){return createHash('sha1').update(key+data+key).digest('base64');}
export function verifySignature(key,data,signature){const expected=Buffer.from(epointSignature(key,data)),actual=Buffer.from(signature||'');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export const safeUser=r=>r?{...JSON.parse(r.profile),id:r.id,email:r.email,role:r.role,approved:!!r.approved,is_owner:r.role==='admin'}:null;
export function dbTools(db){
 const run=(sql,...v)=>db.prepare(sql).bind(...v).run();
 const first=(sql,...v)=>db.prepare(sql).bind(...v).first();
 const all=async(sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
 return {db,run,first,all,async get(id,kind){const r=await first('SELECT value FROM records WHERE id=? AND kind=?',id,kind);return r?JSON.parse(r.value):null;},async records(kind,owner){return (await all('SELECT value FROM records WHERE kind=?'+(owner===undefined?'':' AND owner=?')+' ORDER BY created_at DESC',...[kind,...(owner===undefined?[]:[owner])])).map(r=>JSON.parse(r.value));},async put(kind,owner,v){await run('INSERT INTO records(id,kind,owner,value,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',v.id,kind,owner,JSON.stringify(v),v.created_at||now());return v;},async setting(name,fallback=null){const r=await first('SELECT value FROM settings WHERE name=?',name);return r?JSON.parse(r.value):fallback;},async set(name,value){await run('INSERT INTO settings VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',name,JSON.stringify(value));},audit:(actor,action,target='')=>run('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)',actor,action,target,now())};
}
