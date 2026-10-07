/* Account, patient and owner flows backed by the deployed API. */
(() => {
 'use strict';
 if(!window.RADAZ_PRODUCTION)return;
 const E=R.esc,P=R.platform,X=R.plus;
 const tr=(az,ru,en)=>({az,ru,en}[R.lang]||az);
 const owner=()=>R.state.user?.is_owner||R.state.user?.role==='admin';
 const normalize=()=>{if(R.state.user?.role==='admin')R.state.user={...R.state.user,is_owner:true,role:'doctor'};};
 const msg=()=>tr('Rapor müraciətinizə 2 saat ərzində cavab veriləcək.','Ответ по вашему заключению будет предоставлен в течение 2 часов.','Your reporting request will receive a response within 2 hours.');
 const payMsg=()=>R.config?.payments_enabled?tr('Ödəniş Epoint-in təhlükəsiz səhifəsində aparılır.','Оплата производится на защищённой странице Epoint.','Payment is completed on Epoint’s secure page.'):tr('Ödəniş hazırda demo rejimindədir. Kart məlumatı tələb olunmur və pul tutulmur.','Оплата пока в деморежиме. Данные карты не нужны, деньги не списываются.','Payments are currently in demo mode. No card details or charges.');
 const btn=(label,action,attrs='')=>`<button type="button" class="btn btn-outline btn-sm" data-action="${action}" ${attrs}>${E(label)}</button>`;
 const field=(label,name,value='',extra='')=>`<label class="field">${E(label)}<input name="${name}" value="${E(value)}" ${extra}></label>`;
 const contact=()=>R.config?.contact||{call_center:'*006',phone:''};
 const contactLinks=()=>{const c=contact();return `<a href="tel:${E(c.call_center)}"><strong>${E(c.call_center)}</strong> · ${tr('Çağrı mərkəzi','Колл-центр','Call centre')}</a>${c.phone?`<a href="tel:${E(c.phone.replace(/[^+\d]/g,''))}">${E(c.phone)}</a>`:''}`;};
 const reset=()=>{X.ops=null;X.security=null;X.templates=null;X.hub=null;X.hubCase=null;P.settings=null;P.viewer=null;P.contact=null;P.settingsError='';R.state.cases=[];};
 X.hubBody=()=>{const h=X.hub,c=R.state.selectedCase;if(!c)return '';const tabs=[['messages',R.t('Mesajlar')],['versions',R.t('Hesabat versiyaları')]];return `<div class="x-hub-tabs">${tabs.map(([k,label])=>btn(label,'xHubTab',`data-tab="${k}"`)).join('')}</div>`+(!h?R.note(tr('Yüklənir…','Загрузка…','Loading…')):X.hubTab==='versions'?(h.versions||[]).map(v=>`<details class="x-version"><summary>${R.t('Versiya')} ${v.version} · ${E(v.created_at)}</summary><div class="rich-editor">${R.safeHTML(v.html)}</div></details>`).join(''):X.messageList(h.messages)+X.messageForm(c.id));};
 X.doTrack=async(id,token)=>{const c=await R.api.track(id.trim(),token.trim());X.trackCredentials={id:id.trim(),token:token.trim()};X.track={kind:'case',case:c};const el=R.$('#x-tracking-result');if(el)el.innerHTML=X.trackBody();};
 X.trackBody=()=>{const c=X.track?.case;return c?`<section class="card"><h2>${E(c.id)}</h2>${R.badge(c.status)}<p>${E(c.patient.last_name+' '+c.patient.first_name)}</p>${c.report?`<div class="report-paper"><h3>${tr('Radioloji rapor','Радиологическое заключение','Radiology report')}</h3><div class="rich-editor">${R.safeHTML(c.report)}</div></div>`:R.note(msg())}</section>`:'';};
 R.api.register=async data=>{const r=await R.request('/auth/register',{method:'POST',body:data});reset();R.state.user=r.user;normalize();return R.state.user;};
 const login=R.api.login;R.api.login=async(...args)=>{const r=await login(...args);reset();normalize();return R.state.user;};
 R.actions.ownerLogin=async()=>{const r=await R.request('/auth/owner',{method:'POST',body:{}});reset();R.state.user=r.user;normalize();R.state.dashTab='profile';R.go('/dashboard');};
 R.forms.register=async d=>{await R.api.register(d);R.state.dashTab=d.role==='doctor'?'profile':d.role==='clinic'?'clinics':'cases';R.toast(tr('Hesabınız yaradıldı.','Учётная запись создана.','Your account was created.'));R.go('/dashboard');};
 const oldAuth=R.authPage;
 R.authPage=register=>{const box=document.createElement('div');box.innerHTML=oldAuth(register);if(register){const roles=box.querySelector('.role-select');roles?.insertAdjacentHTML('beforeend',`<label><input type="radio" name="role" value="patient"><span>${R.icon('users',20)}${R.t('Pasiyent')}</span></label>`);}else if(R.config?.owner_login)box.querySelector('.auth-card')?.insertAdjacentHTML('beforeend',`<div class="p-owner-login">${btn(tr('Administrator girişi','Вход администратора','Administrator sign-in'),'ownerLogin')}<p class="tiny-text">${tr('Sayt sahibi üçün təsdiqlənmiş ChatGPT hesabı ilə giriş.','Для владельца сайта с подтверждённой учётной записью ChatGPT.','For the site owner using their verified ChatGPT account.')}</p></div>`);return box.innerHTML;};
 const load=R.loadDashboard;
 R.loadDashboard=async()=>{normalize();await load();if(owner())R.state.pending=await R.api.pending();if(R.state.user?.role==='patient'){[R.state.cases,R.state.myProfile]=await Promise.all([R.api.cases(),R.api.myProfile()]);}};
 const dashboard=R.dashboard;
 R.dashboard=()=>{
  normalize();if(R.state.user?.role!=='patient')return dashboard();
  const u=R.state.user,p=R.state.myProfile||u,cs=R.state.cases||[];
  return R.header()+`<main class="container page"><div class="dashboard-heading"><div><span class="eyebrow">${R.t('Şəxsi kabinet')}</span><h1>${E(u.name)}</h1></div><div class="button-row"><a class="btn btn-primary" href="#/consult">${R.t('Yeni konsultasiya')}</a>${btn(R.t('Çıxış'),'logout')}</div></div><div class="p-patient-grid"><section><h2>${tr('Müraciətlərim','Мои заявки','My requests')}</h2>${cs.map(c=>`<article class="card p-patient-case"><div><strong>${E(c.id)}</strong>${R.badge(c.status)}</div><p>${E(c.patient.first_name+' '+c.patient.last_name)} · ${E(c.metadata?.modality||'DICOM')}</p><p>${c.response_due_at?tr('Cavab vaxtı','Срок ответа','Response due')+': '+E(new Date(c.response_due_at).toLocaleString(R.lang==='az'?'az-AZ':R.lang)):payMsg()}</p><div class="button-row">${['approved','sent'].includes(c.status)?btn(tr('Raporu oxu','Читать заключение','Read report'),'readPatientReport',`data-id="${E(c.id)}"`):''}${c.payment_status==='awaiting_payment'?btn(tr('Ödəniş et','Оплатить','Pay'),'payCase',`data-id="${E(c.id)}"`)+btn(tr('Ödənişi yoxla','Проверить оплату','Check payment'),'checkPayment',`data-id="${E(c.id)}"`):''}</div></article>`).join('')||`<section class="card"><p>${tr('Hələ müraciətiniz yoxdur.','У вас пока нет заявок.','You have no requests yet.')}</p></section>`}</section><section class="card"><h2>${tr('Profilim','Мой профиль','My profile')}</h2><form data-form="patientProfile">${field(R.t('Ad və soyad *'),'name',p.name,'required')}${field(tr('Telefon','Телефон','Phone'),'phone',p.phone||'','type="tel"')}<p>${E(u.email)}</p><button class="btn btn-primary" type="submit">${R.t('Saxla')}</button></form></section></div></main>`+R.footer();
 };
 R.forms.patientProfile=async d=>{R.state.myProfile=await R.api.profile(d);R.render();R.toast(R.t('Profil məlumatları saxlanıldı.'));};
 R.actions.readPatientReport=async el=>{const c=await R.api.case(el.dataset.id);R.modal(tr('Radioloji rapor','Радиологическое заключение','Radiology report'),`<div class="report-paper"><strong>${E(c.patient.first_name+' '+c.patient.last_name)}</strong><div class="rich-editor">${R.safeHTML(c.report)}</div></div>`,true);};
 R.actions.payCase=async el=>{const result=await R.request('/cases/'+encodeURIComponent(el.dataset.id)+'/checkout',{method:'POST',body:{}});location.assign(result.url);};
 R.actions.checkPayment=async el=>{const r=await R.request('/cases/'+encodeURIComponent(el.dataset.id)+'/payment-status');R.toast(r.state==='paid'?tr('Ödəniş təsdiqləndi.','Оплата подтверждена.','Payment confirmed.'):tr('Ödəniş hələ təsdiqlənməyib.','Оплата ещё не подтверждена.','Payment is not confirmed yet.'));await R.loadDashboard();R.render();};
 const createCase=R.api.createCase;
 R.api.createCase=async(data,archive)=>{
  if(R.config?.storage!=='r2')return createCase(data,archive);
  if(!R.state.user)await R.request('/auth/guest',{method:'POST',body:{}});
  if(!archive)throw Error(tr('DICOM ZIP arxivini seçin.','Выберите ZIP-архив DICOM.','Select your DICOM ZIP archive.'));
  const upload=await R.request('/uploads',{method:'POST',body:{size:archive.size}});
  for(let offset=0,part=1;offset<archive.size;offset+=upload.part_size,part++){
   const res=await fetch('/api/uploads/'+upload.id+'/parts/'+part,{method:'PUT',credentials:'same-origin',headers:{'X-RADAZ-CLIENT':'web'},body:archive.slice(offset,offset+upload.part_size)});
   if(!res.ok)throw Error((await res.json()).detail||'Arxiv yüklənmədi.');
   const b=R.$('[data-action="checkout"]');if(b)b.textContent=tr('Yüklənir','Загрузка','Uploading')+' '+Math.min(100,Math.round((offset+upload.part_size)/archive.size*100))+'%';
  }
  await R.request('/uploads/'+upload.id+'/complete',{method:'POST',body:{}});
  return R.request('/consultations',{method:'POST',body:{...data,archive_id:upload.id,sample:false}});
 };
 const consult=R.consultPage;
 R.consultPage=()=>consult();
 R.successPage=()=>{const r=R.state.receipt;if(!r)return `<main class="container page"><a href="#/dashboard">${R.t('Şəxsi kabinet')}</a></main>`;return `<main class="container page p-receipt"><h1>${tr('Müraciətiniz qəbul edildi.','Ваша заявка принята.','Your request was received.')}</h1><p>${r.case.payment_status==='awaiting_payment'?payMsg():msg()}</p><section class="card"><h3>${R.t('Müraciət kodu')}</h3><p>${E(r.case.id)}</p><p>${payMsg()}</p>${r.case.payment_status==='awaiting_payment'?btn(tr('Ödəniş et','Оплатить','Pay'),'payCase',`data-id="${E(r.case.id)}"`):''}<h3>${R.t('Gizli giriş açarı')}</h3><code>${E(r.token)}</code><p>${tr('Müraciət şəxsi kabinetinizdə saxlanılıb.','Заявка сохранена в вашем личном кабинете.','The request is saved in your account.')}</p><a class="btn btn-primary" href="#/dashboard">${R.t('Şəxsi kabinet')}</a>${btn(R.t('Giriş məlumatını saxla'),'downloadReceipt')}</section></main>`;};
 const admin=P.adminPage;
 P.adminPage=()=>{if(R.state.route!=='/admin/contact')return admin();if(!owner())return R.authPage(false);if(!P.contact){R.request('/admin/site-settings').then(v=>{P.contact=v;R.render();}).catch(R.err);return X.shell('RADAZ',R.note(tr('Yüklənir…','Загрузка…','Loading…')));}return X.shell(tr('Əlaqə ayarları','Настройки контактов','Contact settings'),`<h1>${tr('Əlaqə məlumatları','Контакты','Contact details')}</h1><section class="card p-settings"><form data-form="contactSettings">${field(tr('Çağrı mərkəzi','Колл-центр','Call centre'),'call_center',P.contact.call_center,'required maxlength="30"')}${field(tr('Əlavə əlaqə nömrəsi','Дополнительный телефон','Additional phone number'),'phone',P.contact.phone,'type="tel" maxlength="40" placeholder="+994 …"')}<button class="btn btn-primary" type="submit">${R.t('Saxla')}</button></form></section>`);};
 R.forms.contactSettings=async d=>{P.contact=await R.request('/admin/site-settings',{method:'PUT',body:d});R.config=await R.request('/config');R.render();R.toast(R.t('Saxlanıldı'));};
 const footer=R.footer;R.footer=()=>{const box=document.createElement('div');box.innerHTML=footer();box.querySelector('.footer-top')?.insertAdjacentHTML('beforeend',`<div><h4>${tr('Əlaqə','Контакты','Contact')}</h4>${contactLinks()}</div>`);return box.innerHTML;};
 R.guidePage=()=>`<main class="container page p-settings"><h1>${tr('RADAZ-dan istifadə','Как пользоваться RADAZ','Using RADAZ')}</h1><section class="card"><h2>${tr('Pasiyentlər üçün','Для пациентов','For patients')}</h2><ol><li>${tr('Qeydiyyat olmadan konsultasiya göndərə bilərsiniz.','Можно отправить консультацию без регистрации.','You can submit a consultation without registration.')}</li><li>${tr('DICOM fayllarını və ya ZIP arxivini yükləyin, radioloq və uyğun vaxt seçin.','Загрузите DICOM или ZIP, выберите радиолога и время.','Upload DICOM files or a ZIP archive, then select a radiologist and time.')}</li><li>${tr('Müraciət məlumatlarını yoxlayıb göndərin.','Проверьте данные и отправьте заявку.','Review your details and submit.')}</li><li>${tr('Müraciət kodu və gizli açarla raporunuzu izləyin.','Отслеживайте заключение по номеру заявки и секретному ключу.','Track your report using the case number and private key.')}</li></ol><p>${payMsg()}</p><h2>${tr('Radioloqlar üçün','Для радиологов','For radiologists')}</h2><p>${tr('Həkim hesabı yaradın, profilinizi tamamlayın və administrator təsdiqindən sonra qəbul qrafiki əlavə edin. Görüntülər RADAZ proqramında, rapor isə ayrıca səhifədə açılır. Şablonlar KT, MRT, Rentgen və USM qruplarında saxlanılır.','Создайте аккаунт врача, заполните профиль и после подтверждения администратора добавьте расписание. Изображения открываются в RADAZ, заключение — на отдельной странице. Шаблоны распределены по КТ, МРТ, рентгену и УЗИ.','Create a doctor account, complete your profile and add availability after administrator approval. Images open in RADAZ, reports on a separate page. Templates are grouped into CT, MRI, X-ray and ultrasound.')}</p></section></main>`;
 R.privacyPage=()=>`<main class="container page p-settings"><h1>${tr('Məxfilik məlumatı','Информация о конфиденциальности','Privacy information')}</h1><section class="card"><p>${tr('Hesab məlumatları, göndərilən müayinələr və raporlar saytın serverində saxlanılır. Müraciətə onu göndərən şəxs, təyin edilmiş radioloq və sayt administratoru giriş əldə edir.','Данные учётной записи, исследования и заключения хранятся на сервере. Доступ имеют отправитель, назначенный радиолог и администратор сайта.','Account data, submitted studies and reports are stored on the server. The submitting user, assigned radiologist and site administrator have access.')}</p><p>${tr('Yalnız paylaşmağa səlahiyyətiniz olan müayinələri göndərin. Hesab və məlumatlarla bağlı müraciətlər üçün əlaqə bölməsindən istifadə edin.','Загружайте только исследования, которыми вы вправе делиться. По вопросам учётной записи и данных обращайтесь через раздел контактов.','Submit only studies you are authorized to share. Use the contact section for account and data requests.')}</p>${contactLinks()}</section></main>`;
 const replacements={
  'Məxfilik və demo sərhədləri':['Məxfilik','Конфиденциальность','Privacy'],
  'RADİOLOJİ HESABAT · DEMO':['RADİOLOJİ HESABAT','РАДИОЛОГИЧЕСКОЕ ЗАКЛЮЧЕНИЕ','RADIOLOGY REPORT'],
  'Demo hesabat':['Radioloji rapor','Радиологическое заключение','Radiology report'],
  'Bu, demo müraciətidir. Statuslar real ödəniş və ya real bildiriş göndərişini təsdiqləmir.':['','',''],
  'Brauzer demosu · dəyişikliklər bu sessiyada saxlanılır':['','',''],
  'Yalnız sintetik və anonimləşdirilmiş test məlumatları':['','','']
 };
 for(const [key,values] of Object.entries(replacements))['az','ru','en'].forEach((lang,i)=>RADAZ_MESSAGES[lang][key]=values[i]);
 const render=R.render;
 R.render=()=>{
  normalize();render();if(R.state.route==='/dashboard'&&R.state.user?.role==='patient')document.title=R.t('Şəxsi kabinet')+' · RADAZ';
  R.$$('.x-home-promo').forEach(el=>el.remove());
  R.$$('.faq-list details').forEach(el=>{if(/demo|демо/i.test(el.textContent))el.remove();});
  R.$$('.workspace-shell').forEach(el=>{if(!R.state.route.startsWith('/images/'))el.classList.add('p-report');});
  if(!R.$('.p-contact-bar')&&!R.isCaseRoute(R.state.route))R.$('.site-header,.header')?.insertAdjacentHTML('beforebegin',`<div class="p-contact-bar"><div class="container">${contactLinks()}</div></div>`);

  if(owner()){
   R.$$('.dashboard-sidebar nav').forEach(nav=>{if(!nav.querySelector('[href="#/admin/contact"]'))nav.insertAdjacentHTML('beforeend',`<a href="#/admin/contact">${R.icon('phone',18)} ${tr('Əlaqə ayarları','Контакты','Contact settings')}</a><button data-action="dashTab" data-value="admin">${R.icon('shield',18)} ${R.t('Təsdiq gözləyənlər')}</button>`);});
   R.$$('.p-admin-tabs').forEach(nav=>nav.insertAdjacentHTML('beforeend',`<a href="#/admin/contact">${tr('Əlaqə','Контакты','Contact')}</a>`));
  }
  R.$$('.demo-strip,.demo-workspace-banner,.workspace-demo,.x-video-guide,[data-action="demoLogin"],[data-action="demoAdmin"],[data-action="demoDelivery"],[data-action="xOperator"],[data-action="xWaitlist"],[data-action="xCard"],[data-action="xCritical"]').forEach(el=>el.remove());
  R.$$('a[href="#/home-services"],a[href="#/video"],a[href="#/compare"],a[href="#/pricing"],a[href="#/learn"]').forEach(el=>el.remove());
  if(R.state.user?.role==='patient')R.$$('.x-new-nav').forEach(el=>el.remove());
  if(R.state.route==='/consult')R.$$('.payment-demo-box h3,.payment-demo-box p').forEach(el=>el.textContent=payMsg());
  if(R.state.route==='/admin/payments'){
   const form=R.$('[data-form="pPayments"]');if(form){form.querySelector('[name="merchant_id"]')?.setAttribute('placeholder','Epoint public key');form.querySelectorAll('.note').forEach(n=>n.remove());if(!form.querySelector('.p-payment-help'))form.insertAdjacentHTML('beforeend',`<p class="p-payment-help">${tr('Epoint üçün Merchant ID sahəsinə public key, Secret key sahəsinə private key yazın. Live və AZN seçildikdə kart ödənişi aktiv olur. Test rejimində pul tutulmur.','Для Epoint введите public key в Merchant ID и private key в Secret key. Выбор Live и AZN включает оплату. В Test деньги не списываются.','For Epoint, enter the public key as Merchant ID and the private key as Secret key. Live with AZN enables card payments. Test mode does not charge.')}</p>`);}
  }
  // Unsupported demo-only workflow controls must not present actions as real services.
  R.$$('.x-case-hub [data-action="xAddendum"],.x-case-hub [data-action="xReview"],.x-case-hub [data-action="xAttach"]').forEach(el=>el.remove());
 };
 if(R.$('#app').children.length)R.render();
})();
