import {fail,id,now,epointSignature,verifySignature,unseal} from './shared.mjs';
export const paymentSettings=async(s,env)=>unseal(env.SETTINGS_ENCRYPTION_KEY,await s.setting('payment'));
export const chargingEnabled=v=>v.provider==='epoint'&&v.environment==='live'&&v.currency==='AZN'&&!!v.merchant_id&&!!v.secret_key;
async function provider(v,path,payload){
 const data=Buffer.from(JSON.stringify({public_key:v.merchant_id,...payload})).toString('base64');
 const response=await fetch('https://epoint.az/api/1/'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data,signature:epointSignature(v.secret_key,data)}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw fail(502,'Ödəniş provayderi hazırda cavab vermir.');
 const result=await response.json();if(result.status==='error')throw fail(502,'Ödəniş provayderi sorğunu qəbul etmədi. Bank ayarlarını yoxlayın.');return result;
}
export async function checkout(s,env,c,origin){
 const v=await paymentSettings(s,env);if(!chargingEnabled(v))throw fail(409,'Canlı ödəniş aktiv deyil.');
 const amount=Math.round(c.price*100);if(amount<1)throw fail(400,'Həkimin xidmət qiyməti müəyyən edilməyib.');
 let p=await s.first("SELECT * FROM payments WHERE case_id=? AND state='pending' ORDER BY created_at DESC LIMIT 1",c.id);
 if(p?.transaction_id)throw fail(409,'Bu müraciətin ödənişi artıq başlayıb. Kabinetdən ödəniş statusunu yoxlayın.');
 if(!p){p={id:id('pay'),case_id:c.id,amount,currency:'AZN'};await s.run('INSERT INTO payments(id,case_id,amount,currency,state,created_at) VALUES(?,?,?,?,?,?)',p.id,c.id,amount,'AZN','pending',now());}
 const returnUrl=origin+'/?payment='+encodeURIComponent(p.id)+'#/dashboard';
 const result=await provider(v,'request',{amount:(p.amount/100).toFixed(2),currency:'AZN',language:'az',order_id:p.id,description:'RADAZ radioloji rəy',success_redirect_url:returnUrl,error_redirect_url:returnUrl,result_url:origin+'/api/payments/callback'});
 let url;try{url=new URL(result.redirect_url);}catch{throw fail(502,'Provayder etibarlı ödəniş keçidi qaytarmadı.');}
 if(url.protocol!=='https:'||!result.transaction)throw fail(502,'Ödəniş cavabı tamamlanmayıb.');
 await s.run('UPDATE payments SET transaction_id=? WHERE id=?',String(result.transaction),p.id);
 return {id:p.id,url:url.href};
}
export async function settle(s,p,event,{trustedStatus=false}={}){
 if(String(event.transaction)!==p.transaction_id)throw fail(400,'Ödəniş əməliyyatı uyğun gəlmir.');
 if(!trustedStatus&&(event.order_id!==p.id||Math.round(Number(event.amount)*100)!==p.amount))throw fail(400,'Ödəniş məbləği və ya sifarişi uyğun gəlmir.');
 if(event.amount!==undefined&&Math.round(Number(event.amount)*100)!==p.amount)throw fail(400,'Ödəniş məbləği uyğun gəlmir.');
 if(event.currency&&event.currency!==p.currency)throw fail(400,'Ödəniş valyutası uyğun gəlmir.');
 if(event.status!=='success')return {state:p.state};
 const c=await s.get(p.case_id,'case');if(!c)throw fail(404,'Müraciət tapılmadı.');
 const t=now(),deadline=new Date(Date.now()+2*3600000).toISOString();
 await s.db.batch([
  s.db.prepare("UPDATE payments SET state='paid' WHERE id=? AND state='pending'").bind(p.id),
  s.db.prepare("UPDATE records SET value=json_set(value,'$.payment_status','paid','$.status','pending','$.paid_at',?,'$.response_due_at',?) WHERE id=? AND json_extract(value,'$.payment_status')='awaiting_payment' AND EXISTS(SELECT 1 FROM payments WHERE id=? AND state='paid')").bind(t,deadline,c.id,p.id),
  s.db.prepare('UPDATE bookings SET expires=? WHERE case_id=?').bind(8640000000000000,c.id)
 ]);return {state:'paid'};
}
export async function callback(request,s,env){
 if(Number(request.headers.get('content-length')||0)>32000)throw fail(413,'Sorğu çox böyükdür.');
 const form=new URLSearchParams(await request.text()),data=form.get('data')||'',v=await paymentSettings(s,env);
 if(!chargingEnabled(v)||!verifySignature(v.secret_key,data,form.get('signature')))throw fail(403,'Ödəniş imzası etibarsızdır.');
 let event;try{event=JSON.parse(Buffer.from(data,'base64').toString());}catch{throw fail(400,'Ödəniş cavabı oxunmadı.');}
 const p=await s.first('SELECT * FROM payments WHERE id=?',String(event.order_id||''));if(!p)throw fail(404,'Ödəniş tapılmadı.');
 return settle(s,p,event);
}
export async function checkPayment(s,env,p){
 if(p.state==='paid'||!p.transaction_id)return {state:p.state};
 const v=await paymentSettings(s,env);if(!chargingEnabled(v))return {state:p.state};
 const result=await provider(v,'get-status',{transaction:p.transaction_id});
 // The status endpoint is authenticated with the merchant signature and queried by our stored transaction.
 return settle(s,p,{...result,transaction:result.transaction||p.transaction_id},{trustedStatus:true});
}
