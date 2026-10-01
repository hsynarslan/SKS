# SKS Rezervasyon Sistemi — Yaşar Üniversitesi

Yaşar Üniversitesi Sağlık, Kültür ve Spor (SKS) tesisleri için rezervasyon sisteminin tıklanabilir arayüz
prototipi. Sunucu gerekmez; veriler tarayıcıda (`localStorage`) tutulur.

**Demo:** https://hsynarslan.github.io/SKS/

```bash
python3 -m http.server 8000
# http://localhost:8000/
```

## Deneme hesapları

Herhangi bir şifreyle girilir (demo; gerçek şifre yazmayın). Sağ üstteki **EN / TR** düğmesiyle dil değişir.

| Kullanıcı adı | Kim | Görebildikleri |
|---|---|---|
| `ogrenci` | Elif Yılmaz — öğrenci, Modern dans topluluğu kaptanı | Yeni · Takvim · Rezervasyonlarım · Bildirimler |
| `kaptan` | Can Öztürk — öğrenci, Voleybol takımı kaptanı | aynı |
| `sks` | Murat Kaya — SKS onaylayıcı | + Onaylar · Yoklama · Raporlar |
| `admin` | Ayşe Demir — yönetici | + Yönetim |

Örnek verilere dönmek için tarayıcının site verilerini temizleyin ya da gizli pencerede açın.

## Uygulanan kurallar

Kurallar **Yönetim → Kurallar** sekmesinden değiştirilebilir.

| Kural | Varsayılan |
|---|---|
| Talep zamanı | En az 2 saat önceden, en çok 14 gün sonrası için |
| İptal | Rezervasyona 3 saat kalana kadar |
| En uzun süre | 3 saat |
| Kota | Haftada en fazla 3 aktif bireysel talep (takım talepleri hariç) |
| Gelmeme yaptırımı | 30 gün içinde 2 kez gelmeyen 14 gün talep oluşturamaz |
| Feragatname | Eksik imza varken SKS uyarıyla onaylayabilir |
| Otomatik onay | Fitness salonunda bireysel talepler onaysız kesinleşir |
| Takım talebi | Yalnızca kaptan ve antrenör açabilir |
| Çakışma | Aynı kişi aynı saatte iki rezervasyonda yer alamaz |
| Özel kullanım saatleri | Örnek: Fitness çarşamba 18–22 kadınlara özel, spor salonu cuma 08–12 personel saati |
| Katılımcılar | Numara öğrenci rehberinde yoksa eklenemez |

## Ekranlar ve özellikler

**Öğrenci / personel**
- **Feragatname ve KVKK:** usul ve esaslar, KVKK aydınlatma metni, açık rıza; akademik yıl sonunda ve yeni sürüm
  yayınlandığında yeniden onay istenir. Kim hangi sürümü ne zaman imzaladı kaydedilir.
- **Yeni rezervasyon:** alan bilgisi (konum, ekipman, kurallar), yarım salon seçimi, seçilen gün için dolu saatler,
  takım seçilince üyelerin otomatik eklenmesi, **her hafta tekrarlayan** takım rezervasyonu (dönem sonuna kadar;
  uymayan haftalar listelenir), kurallar özeti.
- **Takvim:** hafta ve gün görünümü; onaylı / ön rezervasyon / kapalı / özel kullanım saatleri; yarım salon blokları;
  boş saate tıklayınca dolu form.
- **Rezervasyonlarım:** yaklaşan ve geçmiş; davet edildiğiniz rezervasyonlar; **giriş kodu**; iptal (süre kuralıyla);
  **takvime ekle (.ics)**.
- **Bildirimler:** onay, red, iptal, davet, hatırlatma (24 saat kala), gelmeme bildirimi. Her bildirim e-posta olarak
  da gönderilmiş sayılır (prototipte e-posta adresi gösterilir).
- **Katılımcı daveti:** davet edilen öğrenci feragatnameyi onaylayıp katılır ya da "Katılmayacağım" der; talep sahibine
  bildirilir.

**SKS**
- **Onaylar:** seri talepler tek kartta; **toplu onay**; feragatname eksikse uyarı; detaydan onay/red,
  **eksiklere hatırlatma**, onaylı rezervasyonu **sebep yazarak iptal**; tüm rezervasyonlarda arama (ad, numara,
  katılımcı, giriş kodu).
- **Yoklama:** giriş kodu ile bulma; günün ve yoklaması alınmamış geçmiş rezervasyonlar; kişi kişi geldi/gelmedi;
  sonuç Tamamlandı / Gelinmedi olarak kaydedilir ve gelmeme kuralına işlenir.
- **Raporlar:** tarih aralığı (7 gün, 30 gün, bu dönem, özel); rezervasyon, kişi, katılım ve gelmeme oranı;
  alan bazında kullanım; gün × saat yoğunluk haritası; fakülteye göre kullanım; **Excel'e aktarma (CSV)**.

**Admin**
- **Alanlar** (konum, ekipman, kurallar, bölünebilir, otomatik onay), **Açık saatler** (kimler kullanabilir),
  **Kapalı günler** (etkilenen rezervasyonları iptal edip bildirme), **Takımlar** (kaptan, antrenör, üyeler),
  **Kullanıcılar ve roller**, **Kurallar**, **Feragatname** (metin düzenleme, yeni sürüm yayınlama),
  **İşlem kaydı** (kim, ne zaman, ne yaptı).

**Genel:** Türkçe / İngilizce arayüz; telefona uygulama olarak kurulabilir (PWA, çevrimdışı açılış);
mobil uyumlu; Yaşar Üniversitesi kurumsal renkleri (`#00448F`, `#183249`, `#FFB901`).

Durum makinesi: `PENDING → APPROVED → COMPLETED / NO_SHOW`, ya da `REJECTED` / `CANCELLED`.

## Prototipte olmayanlar (gerçek sistem için)

- Üniversite hesabıyla giriş (SSO) ve ortak veri deposu; öğrenci rehberinin öğrenci bilgi sisteminden gelmesi
- Gerçek e-posta gönderimi
- QR kod (prototipte 6 haneli giriş kodu kullanılıyor)
- Resmî Yaşar Üniversitesi logosu (kurumsal kimlik kılavuzuna uygun olarak eklenmeli)
- Feragatname ve KVKK metinleri örnektir; hukuk birimi onayı gerekir

## Dosyalar

```
index.html             Sayfa iskeleti
css/styles.css         Tasarım (renk değişkenleri :root içinde)
js/i18n.js             İngilizce metinler
js/data.js             Örnek veri (kullanıcılar, rehber, alanlar, rezervasyonlar)
js/app.js              Ekranlar, kurallar ve yönlendirme
manifest.webmanifest   Uygulama olarak kurulum
sw.js                  Çevrimdışı açılış
img/                   Uygulama ikonları
```
