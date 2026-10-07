# RADAZ saytının istifadəsi

## Kompüterdə açmaq

`RADAZ-Local.cmd` faylını iki dəfə klikləyin və **http://127.0.0.1:5195** ünvanını açın. İlk dəfə öz adınız, emailiniz və ən az 12 simvolluq şifrənizlə lokal administrator yaradın. Sonra eyni email və şifrə ilə daxil olun. Server açıq qalmalıdır. Hesablar və fayllar `data/local` qovluğunda saxlanır; server bağlananda silinmir.

Lokal və internet saytının bazaları ayrıdır. İnternetdə yaradılmış hesab lokal versiyaya avtomatik köçürülmür. Sayt Node.js ilə işləyir; Python venv klinikadan DICOM qəbul edən proqram üçündür.

## Giriş və həkimlər

Qeydiyyat yalnız həkimlər üçündür. Administrator həkimi təsdiqləyir. Həkim kabinetində profilini, iş qrafikini və öz klinikalarını hazırlayır. İnternet saytında sahib ilk giriş üçün **Administrator girişi** seçir; sonra **Hesab və şifrə** bölməsində email girişinə şifrə təyin edə bilər.

Pasiyent qeydiyyatsız konsultasiya göndərir və ona verilən şəxsi izləmə keçidi ilə nəticəni alır. **“Rapor müraciətinizə 2 saat ərzində cavab veriləcək.”** yalnız konsultasiyanın ödənişi tamamlandıqdan sonra həmin pasiyentə göstərilir.

## Admin paneli

- **Qazanc ayarları:** konkret həkimi seçin. Konsultasiya qiymətini, həkimin faizini və ya sabit manat məbləğini daxil edib **Bu həkimin ayarlarını saxla** seçin. Digər həkimin ayarları dəyişmir.
- **Həkim hesabatı:** həkim və tarix aralığı, cari/keçən ay, cəmlər və CSV. Həkim öz kabinetində cari ay qazancını, **Qazancım** bölməsində yalnız öz hesabatını görür.
- **Klinika bağlantıları:** klinikanı seçib lokal serverin IP-si, AE Title, port və icazəli cihazları göstərin. Aşağıdakı qəbuledici quraşdırılmalıdır.
- **Ödəniş ayarları:** bank məlumatları və provayder açarları. Məxfi açarlar saxlandıqdan sonra geri göstərilmir.
- **Əlaqə ayarları:** **Çağrı mərkəzi: *006** və əlavə telefon. Telefon nömrəsini burada özünüz əlavə edin.
- **RADAZ bağlantısı:** proqramın ünvanı və Windows keçidi. Mövcud RADAZ proqramına repository-dəki qəbul modulu qoşulmalıdır; təlimat README.md-dədir.

Qazanc təsdiqlənmiş real ödəniş və tamamlanmış rapor əsasında hesablanır. Ödəniş sınaqları qazanca daxil edilmir. Köhnə raporların hesablanmış məbləği yeni ayarlardan təsirlənmir. Panel bank köçürməsi etmir.

## Klinikadan cihaz görüntüləri göndərmək

1. Həkim profilində klinika yaradın; klinikanın **Bağlantı ayarları** bölməsini açın.
2. Klinikadakı serverin IP-si, RADAZ AE Title və TCP portu yazın. Şəbəkə cihazları üçün dinləmə IP-si serverin lokal IP-si və ya `0.0.0.0` olmalıdır. Göndərən cihazın AE Title və IP-sini əlavə edin.
3. Qəbulu aktivləşdirin, saxlayın və **Bağlantı faylı yarat** seçin.
4. Klinikanın serverində `integrations/clinic/setup.ps1` başladın. Yüklənmiş `radaz-clinic.json` faylını həmin qovluğa qoyun.
5. Həmin qovluqdan `.venv/Scripts/python.exe bridge.py --config radaz-clinic.json --check` ilə bağlantını yoxlayın. Sonra `--check` olmadan başladın və açıq saxlayın.
6. Cihazda göndəriş ünvanı kimi klinikadakı serverin IP-si, AE Title və portunu seçin. Firewall-da həmin cihazlara seçilmiş port üçün icazə verilməlidir.

Görüntülər əvvəl lokal növbəyə yazılır; sayt əlçatan olduqda avtomatik ötürülür. Saytdakı **Son qəbul** tarixini yoxlayın. Klinikadan gələn müayinələr klinikanın həkiminə təyin olunur və ödənişsiz/hesablanmamış statusdadır. Rapor artıq redaktə edilərkən əlavə görüntü gələrsə, qəbul dayandırılır və lokal fayllar saxlanır. Ətraflı hədlər README.md-dədir.

## Şablonlar və raporlar

**Şablon kitabxanası** KT, MRT, Rentgen və USM qruplarına bölünür. Şrift, ölçü, rəng, başlıq, hizalama, siyahı, cədvəl və xanalarla işləmək mümkündür. **Önbaxış**, **Surətini yarat** və **Ctrl+S** mövcuddur. Dəyişiklikdən sonra şablonu saxlayın.

Rapor və görüntülər ayrı səhifələrdə açılır. Uzun raporun aşağı hissəsinə sürüşdürmək mümkündür. Qaralamalar serverdə saxlanır, təsdiqlənmiş rapor kilidlənir.

Ödəniş provayderi seçilmədiyi üçün ödəniş hələ sınaq rejimindədir və pul tutulmur. Real rejim üçün provayderin merchant hesabı, açarları və yoxlanmış inteqrasiyası lazımdır. Bank rekvizitini yazmaq təkbaşına kart ödənişini işə salmır.
