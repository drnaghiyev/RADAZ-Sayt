# RADAZ saytının istifadəsi

Sayt hesabları, profilləri, müraciətləri və raporları serverdə saxlayır. Səhifə yeniləndikdə məlumatlar silinmir. Köhnə brauzer demosunda yaradılan hesablar daimi bazaya yazılmadığı üçün həmin hesablarla ilk dəfə yenidən qeydiyyatdan keçmək lazımdır.

## Giriş

- Pasiyent, həkim və klinika hesabı üçün **Qeydiyyatdan keç** bölməsini açın. Şifrə ən az 12 simvol olmalıdır.
- Sonrakı girişlərdə eyni email və şifrədən istifadə edin.
- Sayt sahibi giriş səhifəsində **Administrator girişi** düyməsini seçir. Bu giriş yalnız əvvəlcədən bağlanmış ChatGPT hesabına icazə verir.
- Həkim profilini və qəbul qrafikini tamamlayır. Həkim qeydiyyatı administrator tərəfindən təsdiqlənir.

## Müraciət və rapor

Pasiyent şəxsi kabinetindən müayinə göndərir. DICOM faylları və ya ZIP arxivi seçilir, sonra radioloq və qəbul intervalı təyin olunur. Müraciət kabinetdə qalır. Saytda **“Rapor müraciətinizə 2 saat ərzində cavab veriləcək”** mətni göstərilir.

Həkim üçün rapor və görüntülər ayrı səhifələrdə açılır. Uzun rapor aşağıya qədər sürüşdürülür. Qaralamalar serverdə saxlanır; təsdiqlənmiş rapor pasiyent kabinetində görünür. Rich-text şablonlar KT, MRT, Rentgen və USM qruplarında yaradılır.

## Administrator ayarları

- **Ödəniş ayarları:** bank və provayder məlumatları şifrəli saxlanır. Məxfi açarlar yenidən göstərilmir. Boş sahə əvvəlki açarı qoruyur.
- **RADAZ bağlantısı:** proqramın real URL ünvanı yazılır. Eyni hostinqdə `/viewer/` marşrutu istifadə oluna bilər. RADAZ proqramına repository-dəki qəbuledici modul qoşulub yenidən yığılmalıdır.
- **Əlaqə ayarları:** call center hazırda `*006`-dır. Əlavə telefon nömrəsini sonradan burada əlavə edin.

Ödəniş provayderi hələ seçilmədiyi üçün ödəniş demo rejimindədir və pul tutulmur. Epoint üçün qoşulma kodu hazırlanıb, başqa provayder seçilərsə onun inteqrasiyası lazımdır. Təkcə bank rekvizitini yazmaq kart ödənişini işə salmır; seçilən provayderin merchant hesabı, açarları və real ödəniş yoxlaması tələb olunur.

## Yerləşdirmə

Hazırkı Sites versiyası D1 məlumat bazası və R2 fayl anbarı ilə işləyir. GitHub repository-si kodu saxlayır; GitHub Pages server funksiyalarını işlətmir. Quraşdırma, mühit dəyişənləri və RADAZ Windows keçidinin addımları README.md faylındadır. Saytın mövcud giriş auditoriyası bu dəyişikliklə genişləndirilmir.

## Admin paneli və qazanc

Giriş səhifəsində “Administrator girişi” ilə daxil olun. Qazanc ayarlarında əvvəl ümumi faiz və ya sabit AZN məbləği yazın. İstəsəniz hər həkimə ayrıca qayda təyin edin. Həkim hesabatında başlanğıc və son tarix, həkim, “Bu ay” / “Keçən ay” seçimi və CSV yükləmə var. Real ödənişli təsdiqlənmiş raporlar hesablanır; ödəniş sınaqları qazanca daxil deyil. Əvvəl hesablanmış qazanc qayda dəyişəndə saxlanılır.
