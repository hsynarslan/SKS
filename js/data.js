/* SKS Rezervasyon Sistemi — örnek veri (prototip).
 * Gerçek sistemde kullanıcılar ve öğrenci rehberi SSO / öğrenci bilgi sisteminden gelir. */
(function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  // n gün sonrası; hafta sonuna denk gelirse sonraki iş gününe kaydırılır (örnek veri kapalı günlere düşmesin)
  const wd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return isoDate(d); };
  const wdFrom = (iso, n) => { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n); return isoDate(d); };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const code = () => Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[O0I1]/g, "X");

  // Belirli bir sırayla aynı sonucu veren basit rastgele sayı üreteci (örnek geçmiş veri için)
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

  function currentAcademicYearEnd() {
    const d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
    return `${y}-08-31`;
  }
  function semesterEnd() {
    const d = new Date(), m = d.getMonth();
    if (m >= 8) return `${d.getFullYear() + 1}-01-16`;
    if (m === 0) return `${d.getFullYear()}-01-16`;
    return `${d.getFullYear()}-06-12`;
  }

  const FACULTIES = ["Mühendislik Fakültesi", "İktisadi ve İdari Bilimler Fakültesi", "Sanat ve Tasarım Fakültesi",
    "İletişim Fakültesi", "Hukuk Fakültesi"];

  function seed() {
    // ---------- Öğrenci ve personel rehberi ----------
    const people = [
      ["Ali Yıldız", "M"], ["Selin Aydın", "F"], ["Burak Çelik", "M"], ["Ece Kurt", "F"], ["Mert Aslan", "M"],
      ["İrem Polat", "F"], ["Kaan Doğan", "M"], ["Derya Güneş", "F"], ["Emre Tekin", "M"], ["Buse Kaya", "F"],
      ["Onur Şimşek", "M"], ["Gizem Ateş", "F"], ["Arda Koç", "M"], ["Melis Uçar", "F"], ["Yiğit Er", "M"], ["Nazlı Bulut", "F"],
    ];
    const directory = {};
    const mail = (name) => name.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i").split(" ").join(".");
    people.forEach(([name, gender], i) => {
      directory[String(20230100 + i * 7)] = { name, gender, type: "student", faculty: FACULTIES[i % FACULTIES.length], email: `${mail(name)}@stu.yasar.edu.tr` };
    });
    const add = (no, name, gender, type, faculty) => {
      directory[no] = { name, gender, type, faculty, email: `${mail(name)}@${type === "staff" ? "" : "stu."}yasar.edu.tr` };
    };
    add("20231045", "Elif Yılmaz", "F", "student", FACULTIES[0]);
    add("20221187", "Can Öztürk", "M", "student", FACULTIES[1]);
    add("20240312", "Zeynep Arslan", "F", "student", FACULTIES[2]);
    add("20210876", "Deniz Şahin", "M", "student", FACULTIES[3]);
    add("20230544", "Efe Koç", "M", "student", FACULTIES[4]);
    add("P-1102", "Murat Kaya", "M", "staff", "Sağlık, Kültür ve Spor");
    add("P-0007", "Ayşe Demir", "F", "staff", "Sağlık, Kültür ve Spor");
    add("P-2001", "Hakan Er", "M", "staff", "Sağlık, Kültür ve Spor");
    add("P-3150", "Seda Tunç", "F", "staff", "Mühendislik Fakültesi");

    const p = (n, off = 0) => Array.from({ length: n }, (_, i) => String(20230100 + ((i + off) % people.length) * 7));

    // ---------- Alanlar ve saatler ----------
    const rooms = [
      { id: "r1", name: "Fitness salonu", type: "Fitness", mode: "shared", capacity: 30, divisible: false, autoApprove: true,
        location: "Spor Merkezi, zemin kat", equipment: "Koşu bandı (8), bisiklet (6), serbest ağırlıklar, kablolu istasyonlar",
        rules: "Havlu kullanımı zorunludur. Ağırlıklar kullanımdan sonra yerine konur." },
      { id: "r2", name: "Dans stüdyosu", type: "Dans stüdyosu", mode: "exclusive", capacity: 20, divisible: false, autoApprove: false,
        location: "Spor Merkezi, 1. kat", equipment: "Aynalı duvar, bale barı, ses sistemi, yoga matları (20)",
        rules: "Stüdyoya sokak ayakkabısıyla girilmez." },
      { id: "r3", name: "Kapalı spor salonu", type: "Spor salonu", mode: "exclusive", capacity: 40, divisible: true, autoApprove: false,
        location: "Spor Merkezi, ana salon", equipment: "Basketbol potası (2), voleybol filesi, skorbord, yedek kulübesi",
        rules: "Salon perdeyle ikiye bölünebilir. Maç ve turnuvalarda öncelik üniversite takımlarındadır." },
    ];
    const hours = [];
    const h = (roomId, day, open, close, audience = "all") => hours.push({ id: uid(), roomId, day, open, close, audience });
    for (const r of rooms) {
      for (const d of [1, 2, 3, 4, 5]) {
        if (r.id === "r1" && d === 3) { h(r.id, d, "08:00", "18:00"); h(r.id, d, "18:00", "22:00", "women"); continue; }
        if (r.id === "r3" && d === 5) { h(r.id, d, "08:00", "12:00", "staff"); h(r.id, d, "12:00", "22:00"); continue; }
        h(r.id, d, "08:00", "22:00");
      }
      h(r.id, 6, "10:00", "18:00");
    }

    // ---------- Takımlar ----------
    const teams = [
      { id: "t1", name: "Basketbol takımı", captain: "20230100", coach: "P-2001", members: p(9, 1) },
      { id: "t2", name: "Voleybol takımı", captain: "20221187", coach: "P-2001", members: p(11) },
      { id: "t3", name: "Modern dans topluluğu", captain: "20231045", coach: "", members: p(7) },
      { id: "t4", name: "Masa tenisi kulübü", captain: "20230149", coach: "", members: p(3, 8) },
    ];

    // ---------- Rezervasyonlar ----------
    const res = (o) => {
      const r = { id: uid(), teamId: "", part: "full", participants: [], signed: [], reason: "", attendance: null, seriesId: "",
        checkinCode: code(), createdAt: Date.now() - 86400000 * 2, ...o };
      if (o.allSigned) { r.signed = [...r.participants]; delete r.allSigned; }
      return r;
    };
    const attAll = (r, absent = []) => {
      const a = {}; [r.ownerNumber, ...r.participants].forEach((no) => { a[no] = !absent.includes(no); }); return a;
    };
    const E = { owner: "ogrenci", ownerName: "Elif Yılmaz", ownerNumber: "20231045" };
    const C = { owner: "kaptan", ownerName: "Can Öztürk", ownerNumber: "20221187" };
    const Z = { owner: "u3", ownerName: "Zeynep Arslan", ownerNumber: "20240312" };
    const D = { owner: "u4", ownerName: "Deniz Şahin", ownerNumber: "20210876" };
    const F = { owner: "u5", ownerName: "Efe Koç", ownerNumber: "20230544" };

    const reservations = [
      res({ ...E, roomId: "r2", date: wd(2), start: "18:00", end: "19:30", teamId: "t3", participants: p(7), signed: p(5), status: "PENDING" }),
      res({ ...E, roomId: "r1", date: wd(1), start: "09:00", end: "10:00", status: "APPROVED", decidedBy: "Otomatik onay" }),
      res({ ...E, roomId: "r3", date: addDays(-3), start: "16:00", end: "18:00", participants: p(3, 4), allSigned: true, status: "REJECTED",
        reason: "Aynı saatte üniversite maçı planlandı.", decidedBy: "Murat Kaya" }),
      res({ ...C, roomId: "r3", date: wd(3), start: "20:00", end: "22:00", teamId: "t2", participants: p(11), allSigned: true, status: "PENDING", seriesId: "s1" }),
      res({ ...C, roomId: "r3", date: wdFrom(wd(3), 7), start: "20:00", end: "22:00", teamId: "t2", participants: p(11), allSigned: true, status: "PENDING", seriesId: "s1" }),
      res({ ...C, roomId: "r3", date: wdFrom(wd(3), 14), start: "20:00", end: "22:00", teamId: "t2", participants: p(11), allSigned: true, status: "PENDING", seriesId: "s1" }),
      res({ ...Z, roomId: "r3", date: wd(1), start: "12:00", end: "13:00", part: "A", participants: ["20231045", "20230149"], signed: ["20230149"], status: "PENDING" }),
      res({ ...D, roomId: "r2", date: addDays(-1), start: "10:00", end: "11:00", participants: p(4, 3), allSigned: true, status: "APPROVED", decidedBy: "Murat Kaya" }),
      res({ ...C, roomId: "r3", date: addDays(0), start: "19:00", end: "21:00", teamId: "t2", participants: p(11), allSigned: true, status: "APPROVED", decidedBy: "Murat Kaya" }),
      res({ ...Z, roomId: "r1", date: addDays(-5), start: "10:00", end: "11:00", status: "CANCELLED", reason: "Kullanıcı iptal etti." }),
    ];

    // Geçmiş 4 haftalık tamamlanmış / gelinmemiş rezervasyonlar (raporlar için)
    const owners = [E, C, Z, D, F];
    for (let i = 0; i < 46; i++) {
      const back = 1 + Math.floor(rnd() * 28);
      const roomId = ["r1", "r1", "r1", "r2", "r3"][Math.floor(rnd() * 5)];
      const startH = [8, 9, 12, 13, 17, 18, 18, 19, 19, 20][Math.floor(rnd() * 10)];
      const date = addDays(-back), day = new Date(date + "T00:00").getDay();
      if (day === 0 || (day === 6 && (startH < 10 || startH > 16))) continue;
      const o = owners[Math.floor(rnd() * owners.length)];
      const n = roomId === "r1" ? Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 8);
      const r = res({ ...o, roomId, date, start: `${pad(startH)}:00`, end: `${pad(startH + 1)}:00`, participants: p(n, Math.floor(rnd() * 16)), allSigned: true,
        status: "COMPLETED", decidedBy: roomId === "r1" ? "Otomatik onay" : "Murat Kaya", createdAt: new Date(date).getTime() - 86400000 * 3 });
      r.participants = [...new Set(r.participants)]; r.signed = [...r.participants];
      const absent = r.participants.filter(() => rnd() < 0.12);
      r.attendance = attAll(r, absent);
      if (rnd() < 0.08) { r.attendance = attAll(r, [r.ownerNumber, ...r.participants]); r.status = "NO_SHOW"; }
      reservations.push(r);
    }
    // Efe Koç: son 30 günde 2 kez gelmedi → 14 gün talep açamaz (yaptırım örneği)
    for (const back of [4, 9]) {
      const r = res({ ...F, roomId: "r1", date: addDays(-back), start: "18:00", end: "19:00", status: "NO_SHOW", decidedBy: "Otomatik onay" });
      r.attendance = { [F.ownerNumber]: false };
      reservations.push(r);
    }

    const now = Date.now();
    const log = [
      { id: uid(), at: now - 3600e3 * 50, by: "Murat Kaya", action: "REJECTED", resId: reservations[2].id, detail: "Aynı saatte üniversite maçı planlandı." },
      { id: uid(), at: now - 3600e3 * 30, by: "Murat Kaya", action: "APPROVED", resId: reservations[7].id, detail: "" },
      { id: uid(), at: now - 3600e3 * 20, by: "Murat Kaya", action: "APPROVED", resId: reservations[8].id, detail: "" },
      { id: uid(), at: now - 3600e3 * 26, by: "Otomatik onay", action: "AUTO_APPROVED", resId: reservations[1].id, detail: "" },
    ];
    for (const r of reservations) log.push({ id: uid(), at: r.createdAt, by: r.ownerName, action: "CREATED", resId: r.id, detail: "" });

    const np = (r, extra = {}) => ({ roomId: r.roomId, date: r.date, start: r.start, end: r.end, code: r.checkinCode, owner: r.ownerName, reason: r.reason, ...extra });
    const notifications = [
      { id: uid(), to: "20231045", at: now - 3600e3 * 26, kind: "auto", params: np(reservations[1]), resId: reservations[1].id, read: false },
      { id: uid(), to: "20231045", at: now - 3600e3 * 50, kind: "rejected", params: np(reservations[2]), resId: reservations[2].id, read: true },
      { id: uid(), to: "20231045", at: now - 3600e3 * 5, kind: "invite", params: np(reservations[6]), resId: reservations[6].id, read: false },
      { id: uid(), to: "20221187", at: now - 3600e3 * 20, kind: "approved", params: np(reservations[8]), resId: reservations[8].id, read: false },
    ];

    return {
      version: 3,
      settings: {
        minLeadHours: 2, maxDaysAhead: 14, cancelHours: 3, maxDurationMin: 180,
        weeklyQuota: 3, noShowLimit: 2, noShowWindowDays: 30, banDays: 14,
        requireAllWaivers: false, semesterEnd: semesterEnd(),
      },
      waiverDoc: {
        version: 1, publishedAt: now - 86400000 * 30, validUntil: currentAcademicYearEnd(),
        items: [
          "Tesisleri kullanan kişi, spor yapmasına engel bir sağlık sorunu bulunmadığını beyan eder.",
          "Kronik rahatsızlığı olan kullanıcılar, hekim onayı almadan yoğun egzersiz yapmamalıdır.",
          "Ekipmanlar amacına uygun ve görevli personelin yönlendirmelerine göre kullanılır.",
          "Tesise uygun spor kıyafeti ve temiz spor ayakkabısı ile girilir.",
          "Rezervasyon saatine uyulur; 15 dakika gecikmede rezervasyon iptal edilebilir.",
          "Kullanıcının kendi dikkatsizliği sonucu oluşan yaralanmalardan üniversite sorumlu tutulamaz.",
          "Takım rezervasyonlarında her katılımcının bu feragatnameyi ayrıca imzalaması gerekir.",
          "Kişisel eşyaların korunmasından kullanıcı sorumludur; dolaplar gün sonunda boşaltılır.",
          "Kurallara uymayan kullanıcıların rezervasyon hakkı SKS tarafından askıya alınabilir.",
          "Bu feragatname bir akademik yıl boyunca geçerlidir.",
        ],
        kvkk: [
          "Veri sorumlusu: Yaşar Üniversitesi.",
          "İşlenen veriler: ad soyad, öğrenci/personel numarası, e-posta, fakülte, rezervasyon ve katılım bilgileri, sağlık beyanı.",
          "Amaç: spor tesislerinin rezervasyonu, güvenli kullanımı ve kapasite planlaması.",
          "Sağlık beyanı özel nitelikli kişisel veridir ve yalnızca açık rızanızla işlenir.",
          "Erişim: yalnızca SKS yetkilileri ve sistem yöneticileri. Öğrenciler başkalarının bilgilerini göremez.",
          "Saklama süresi: rezervasyon kayıtları 2 yıl, feragatname kayıtları ilgili akademik yılın bitiminden itibaren 2 yıl.",
          "KVKK'nın 11. maddesindeki haklarınız için SKS ile iletişime geçebilirsiniz.",
        ],
      },
      directory,
      users: {
        ogrenci: { username: "ogrenci", number: "20231045", role: "USER", waiverVersion: null, waiverSignedAt: null },
        kaptan: { username: "kaptan", number: "20221187", role: "USER", waiverVersion: 1, waiverSignedAt: now - 86400000 * 20 },
        sks: { username: "sks", number: "P-1102", role: "SKS", waiverVersion: 1, waiverSignedAt: now - 86400000 * 25 },
        admin: { username: "admin", number: "P-0007", role: "ADMIN", waiverVersion: 1, waiverSignedAt: now - 86400000 * 25 },
      },
      teams, rooms, hours,
      closures: [{ id: uid(), start: addDays(20), end: addDays(22), reason: "Zemin bakımı" }],
      reservations, notifications, log,
    };
  }

  window.SKS_SEED = seed;
})();
