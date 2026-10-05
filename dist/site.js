(() => {
  'use strict';
  const words = {
    az: {real:'RADAZ proqramından ekran görüntüləri',eyebrow:'PROQRAMA YAXINDAN BAXIŞ',heading:'İş mühitiniz. Bütün detalları ilə.',lead:'Görüntünü açın, müstəviləri müqayisə edin və hesabatınızı hazırlayın.',viewer:'2D Viewer',mpr:'MPR',report:'Hesabat',viewerTitle:'Görüntünün hər detalı, bir ekranda.',viewerText:'Seriya siyahısı, pəncərə ayarları və ölçmə alətləri ilə DICOM görüntülərinə baxış.',mprTitle:'Müayinəni üç müstəvidə araşdırın.',mprText:'Aksial, koronal və sagittal görünüşlər, əlaqəli lokayzer xətləri və qalınlıq seçimi.',reportTitle:'Görüntüdən radioloji hesabata.',reportText:'Müayinə məlumatları və hesabat hazırlığı üçün RADAZ iş mühiti.',note:'RADAZ 0.2.18 · sintetik test müayinəsi',enlarge:'Tam ekranda bax',close:'Bağla',caption:'Real proqram interfeysi · sintetik test görüntüləri'},
    ru: {real:'Скриншоты программы RADAZ',eyebrow:'ЗНАКОМСТВО С ПРОГРАММОЙ',heading:'Ваша рабочая среда. Во всех деталях.',lead:'Открывайте изображения, сравнивайте плоскости и готовьте заключение.',viewer:'2D Viewer',mpr:'MPR',report:'Заключение',viewerTitle:'Все детали изображения на одном экране.',viewerText:'Просмотр DICOM со списком серий, настройками окна и инструментами измерения.',mprTitle:'Исследуйте три плоскости.',mprText:'Аксиальные, корональные и сагиттальные виды, связанные линии локализации и выбор толщины.',reportTitle:'От изображения к заключению.',reportText:'Рабочая среда RADAZ для данных исследования и подготовки заключения.',note:'RADAZ 0.2.18 · синтетическое исследование',enlarge:'Открыть на весь экран',close:'Закрыть',caption:'Реальный интерфейс · синтетические тестовые изображения'},
    en: {real:'Screenshots from the RADAZ application',eyebrow:'A CLOSER LOOK',heading:'Your workspace. In every detail.',lead:'Open images, compare planes and prepare your report.',viewer:'2D Viewer',mpr:'MPR',report:'Report',viewerTitle:'Every image detail, on one screen.',viewerText:'View DICOM images with the series list, window settings and measurement tools.',mprTitle:'Explore three anatomical planes.',mprText:'Axial, coronal and sagittal views, linked reference lines and slice thickness controls.',reportTitle:'From images to a radiology report.',reportText:'The RADAZ workspace for study information and report preparation.',note:'RADAZ 0.2.18 · synthetic test study',enlarge:'View full screen',close:'Close',caption:'Actual application interface · synthetic test images'}
  };
  const W=()=>words[R.lang]||words.az;
  const keys=['viewer','mpr','report'];
  let selected='viewer', previousFocus=null;
  const source=key=>`assets/radaz-${key}.jpg`;
  R.viewerMock=()=>`<div class="product-visual"><button type="button" class="product-screen" data-screenshot="viewer" aria-label="${W().enlarge}"><div class="product-label"><strong>RADAZ</strong><span>2D VIEWER / DICOM</span></div><img src="${source('viewer')}" alt="${W().real} — 2D Viewer" width="1280" height="720" fetchpriority="high"></button><p class="product-caption">${R.icon('scan',18)} ${W().caption}</p></div>`;
  const gallery=()=>`<section class="real-gallery container" id="radaz-screenshots" aria-labelledby="gallery-title"><div class="section-head"><div><div class="eyebrow">${W().eyebrow}</div><h2 id="gallery-title">${W().heading}</h2></div><p>${W().lead}</p></div><div class="gallery-tabs" role="tablist" aria-label="${W().real}">${keys.map(key=>`<button class="gallery-tab" type="button" role="tab" id="tab-${key}" aria-controls="screenshot-panel" aria-selected="${selected===key}" tabindex="${selected===key?0:-1}" data-gallery="${key}">${W()[key]}</button>`).join('')}</div><div id="screenshot-panel" role="tabpanel" aria-labelledby="tab-${selected}" tabindex="0">${panel()}</div></section>`;
  function panel(){return `<div class="gallery-frame"><button type="button" class="gallery-open" data-screenshot="${selected}" aria-label="${W().enlarge}"><img src="${source(selected)}" alt="${W().real} — ${W()[selected]}" width="1280" height="720" loading="lazy"></button></div><div class="gallery-footer"><div><h3>${W()[selected+'Title']}</h3><p>${W()[selected+'Text']}</p></div><small>${W().note}<br>${W().enlarge}</small></div>`;}
  const originalHome=R.home;
  R.home=()=>originalHome().replace('<section class="section container">',gallery()+'<section class="section container">');
  function select(key,focus=false){
    if(!keys.includes(key))return;
    selected=key;
    document.querySelectorAll('[data-gallery]').forEach(el=>{el.setAttribute('aria-selected',String(el.dataset.gallery===key));el.tabIndex=el.dataset.gallery===key?0:-1;});
    const el=document.querySelector('#screenshot-panel');if(el){el.innerHTML=panel();el.setAttribute('aria-labelledby','tab-'+key);}
    if(focus)document.querySelector('#tab-'+key)?.focus();
  }
  function open(key){
    if(!keys.includes(key))return;
    previousFocus=document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='screenshot-dialog';dialog.setAttribute('aria-label',W().real);
    dialog.innerHTML=`<header><span>RADAZ · ${W()[key]}</span><button type="button">${W().close} ×</button></header><img src="${source(key)}" alt="${W().real} — ${W()[key]}">`;
    document.body.append(dialog);dialog.showModal();
    dialog.querySelector('button').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{dialog.remove();previousFocus?.focus();},{once:true});
  }
  document.addEventListener('click',e=>{const shot=e.target.closest('[data-screenshot]');if(shot)open(shot.dataset.screenshot);const tab=e.target.closest('[data-gallery]');if(tab)select(tab.dataset.gallery);});
  document.addEventListener('keydown',e=>{const tab=e.target.closest('[data-gallery]');if(!tab)return;let i=keys.indexOf(tab.dataset.gallery);if(e.key==='ArrowRight')i=(i+1)%keys.length;else if(e.key==='ArrowLeft')i=(i+keys.length-1)%keys.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=keys.length-1;else return;e.preventDefault();select(keys[i],true);});
  if(document.querySelector('.hero'))R.render();
  if(document.modelContext?.registerTool){
    const lifetime=new AbortController();
    try{Promise.resolve(document.modelContext.registerTool({
      name:'select_product_screenshot',title:'RADAZ ekran görüntüsünü seç',
      description:'Ana səhifədə RADAZ proqramının 2D Viewer, MPR və ya hesabat ekran görüntüsünü göstərir. Müayinə məlumatlarını dəyişmir.',
      inputSchema:{type:'object',properties:{screen:{type:'string',enum:keys}},required:['screen'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){
        if(!input||typeof input!=='object'||Object.keys(input).length!==1||!keys.includes(input.screen))throw Error('Expected screen: viewer, mpr or report.');
        const el=document.querySelector('#radaz-screenshots');if(!el)throw Error('Open the home page first.');
        select(input.screen);el.scrollIntoView({behavior:'instant',block:'start'});
        return {screen:selected,title:W()[selected+'Title']};
      }
    },{signal:lifetime.signal})).catch(()=>{});}catch{}
    window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
  }
})();
