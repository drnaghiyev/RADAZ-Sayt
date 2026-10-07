# RADAZ saytını işə salmaq

Bu repository saytın interfeysini, Node.js serverini, məlumat bazasını yaradan kodu və RADAZ bağlantı modulunu saxlayır. Node.js 24 və ya daha yeni versiya tələb olunur.

```sh
npm ci
npm run setup
npm start
```

`setup` zamanı öz administrator emailinizi, saytın ünvanını və ən az 12 simvolluq şifrənizi daxil edin. Şifrə terminalda görünmür. Hazır admin şifrəsi yoxdur. Açıq qeydiyyatla administrator yaratmaq mümkün deyil.

Lokal yoxlama üçün `http://127.0.0.1:5188`, real hostinq üçün öz HTTPS domeninizi seçin. Port məşğuldursa `.env` daxilində `PORT` və `PUBLIC_ORIGIN` dəyərlərini birlikdə dəyişin. Real hostinqdə HTTPS reverse proxy və `NODE_ENV=production` istifadə edin.

## Ödəniş ayarları

Administrator kabinetində **Ödəniş ayarları** bölməsini açın. Bank məlumatları və provayder açarları serverdə şifrələnərək saxlanır. Digər hesabların bu bölməyə API vasitəsilə də girişi yoxdur. Saxlanmış məxfi açar yenidən göstərilmir; boş sahə köhnə açarı qoruyur.

Bu mərhələdə kartdan pul tutulmur. Ödəniş provayderi seçildikdən sonra onun ödəniş və imzalanmış bildiriş inteqrasiyası qoşulmalıdır. Müraciətlər ödəniş edilməmiş kimi saxlanır.

## Rapor və şablonlar

Həkim müraciəti açanda rapor səhifəsi görünür. **Görüntülər** ayrıca vərəqdə açılır. Şablon kitabxanasında rich-text redaktoru var; hər şablon KT, MRT, Rentgen və ya USM qrupuna aiddir. Şablonlar həkimin öz hesabında qalır. Rapor qaralamaları serverdə saxlanır, təsdiqlənmiş rapor kilidlənir.

## Mövcud RADAZ proqramına qoşulma

```sh
node integrations/radaz/install-receiver.mjs "RADAZ-proqraminin-source-qovlugu"
```

RADAZ qurulmazdan əvvəl `NEXT_PUBLIC_RADAZ_SITE_ORIGINS` dəyişəninə saytın dəqiq ünvanını yazın. Sonra RADAZ-ı yenidən build edib yerləşdirin/quraşdırın. Köhnə quraşdırılmış proqram avtomatik bu modulu almır.

Sayt administratoru **RADAZ bağlantısı** bölməsində görüntüləyicinin ünvanını yazır. Gələcək eyni hostinqdə `/viewer/` istifadə edilə bilər; həmin yol və proqramın resursları hostinqdə RADAZ-a yönləndirilməlidir. Keçid iki dəqiqəlik və birdəfəlikdir.

Windows proqramını başlatmaq üçün, qəbuledici modulu olan RADAZ quraşdırıldıqdan sonra:

```powershell
.\integrations\windows\install-radaz-link.ps1 -SiteOrigin 'https://sizin-domeniniz.az'
```

Bu modul hər iş kompüterində qurulur. Saytın RADAZ ayarlarında lokal ünvanı `http://localhost:5173/` seçib proqramı başlatma düyməsini aktiv edin. Brauzer xarici proqramı açmazdan əvvəl normal təsdiq pəncərəsi göstərə bilər.

## Hostinq və ehtiyat nüsxə

GitHub-a kodun göndərilməsi serveri internetdə işə salmır. Mövcud `chatgpt.site` ünvanı interfeys önizləməsidir və bank məlumatlarını saxlamır. Həqiqi hesablar və davamlı məlumatlar üçün bu Node.js serveri öz hostinqinizdə işləməlidir; GitHub Pages uyğun deyil.

`.env`, `SETTINGS_ENCRYPTION_KEY` və `data` qovluğunu məxfi saxlayın, GitHub-a göndərməyin. Məlumat bazası və şifrələmə açarının birlikdə ehtiyat nüsxəsini saxlayın. Daha ətraflı texniki quraşdırma [README](README.md) faylındadır.

Yoxlama: `npm run verify` və `npm test`. Qəbul yoxlamasında şablonun formatlı saxlanması, raporun yenilənmədən sonra qalması və 5 sintetik KT görüntüsünün RADAZ-a ötürülməsi brauzerdə yoxlanılıb. Windows protokolunun real quraşdırılmış EXE ilə işə salınması bu sınağa daxil deyil.
