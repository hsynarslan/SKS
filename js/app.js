/* SKS Rezervasyon Sistemi (Yaşar Üniversitesi) — tıklanabilir prototip.
 * Veriler tarayıcıda (localStorage) tutulur; gerçek sistemde SSO ve sunucu API'si ile değiştirilir.
 * Durum makinesi: PENDING → APPROVED → COMPLETED / NO_SHOW, ya da REJECTED / CANCELLED. */
(function () {
  "use strict";

  const STORE_KEY = "sks-rezervasyon-v3";
  const SESSION_KEY = "sks-rezervasyon-session";
  const ACTIVE = ["PENDING", "APPROVED"];

  // ---------- Dil ----------
  let LANG = safeGet("sks-lang") === "en" ? "en" : "tr";
  const t = (s, p) => {
    let out = (LANG === "en" && window.SKS_I18N?.en?.[s]) || s;
    if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (p[k] ?? m));
    // İngilizcede tekil biçim: "1 people" → "1 person"
    if (LANG === "en" && p && Object.values(p).some((v) => v === 1)) {
      out = out.replace(/\b1 (people|participants|reservations|weeks|members|users|places|active requests|waivers)\b/g, (m, w) =>
        "1 " + ({ people: "person", participants: "participant", reservations: "reservation", weeks: "week", members: "member", users: "user", places: "place", "active requests": "active request", waivers: "waiver" }[w]))
        .replace(/\b1 participant have\b/g, "1 participant has");
    }
    return out;
  };
  const loc = () => (LANG === "en" ? "en-GB" : "tr-TR");

  const STATUS = {
    PENDING:   { label: "Ön rezervasyon", cls: "b-warning", icon: "ti-hourglass" },
    APPROVED:  { label: "Onaylandı",      cls: "b-success", icon: "ti-check" },
    COMPLETED: { label: "Tamamlandı",     cls: "b-success", icon: "ti-checks" },
    NO_SHOW:   { label: "Gelinmedi",      cls: "b-danger",  icon: "ti-user-x" },
    REJECTED:  { label: "Reddedildi",     cls: "b-danger",  icon: "ti-x" },
    CANCELLED: { label: "İptal",          cls: "b-danger",  icon: "ti-ban" },
  };
  const ROLES = { USER: "Kullanıcı", SKS: "SKS onaylayıcı", ADMIN: "Admin" };
  const ROOM_TYPES = ["Fitness", "Dans stüdyosu", "Spor salonu"];
  const MODES = { shared: "paylaşımlı", exclusive: "münhasır" };
  const AUDIENCE = { all: "Herkes", student: "Yalnızca öğrenci", staff: "Personel saati", women: "Kadınlara özel" };
  const PARTS = { full: "Tam salon", A: "Yarım salon (A)", B: "Yarım salon (B)" };
  const LOG_LABEL = {
    CREATED: "Talep oluşturuldu", AUTO_APPROVED: "Otomatik onaylandı", APPROVED: "Onaylandı", REJECTED: "Reddedildi",
    CANCELLED: "Kullanıcı iptal etti", CANCELLED_STAFF: "SKS iptal etti", CLOSURE_CANCELLED: "Kapalı gün nedeniyle iptal",
    ATTENDANCE: "Yoklama alındı", INVITE_ACCEPTED: "Katılımcı feragatnameyi onayladı", INVITE_DECLINED: "Katılımcı daveti reddetti",
    WAIVER_REMINDER: "Feragatname hatırlatması gönderildi", ROLE: "Rol değiştirildi", WAIVER_PUBLISHED: "Yeni feragatname sürümü yayınlandı",
    SETTINGS: "Kurallar güncellendi",
  };
  const NOTIF = {
    created:         ["Talebiniz alındı", "{room} · {when}. SKS onayından sonra kesinleşecek."],
    auto:            ["Rezervasyonunuz onaylandı", "{room} · {when} · otomatik onay. Giriş kodu: {code}"],
    invite:          ["Katılımcı daveti", "{owner} sizi {room} rezervasyonuna ekledi ({when}). Feragatnameyi onaylayın."],
    approved:        ["Rezervasyon onaylandı", "{room} · {when}. Giriş kodu: {code}"],
    rejected:        ["Talep reddedildi", "{room} · {when} · Sebep: {reason}"],
    cancelled_staff: ["Rezervasyon SKS tarafından iptal edildi", "{room} · {when} · Sebep: {reason}"],
    cancelled_owner: ["Rezervasyon iptal edildi", "{owner}, {room} rezervasyonunu iptal etti ({when})."],
    closure:         ["Tesis kapalı: rezervasyon iptal edildi", "{room} · {when} · {reason}"],
    declined:        ["Katılımcı daveti reddetti", "{name} ({no}) {room} rezervasyonuna katılmayacak ({when})."],
    accepted:        ["Katılımcı feragatnameyi onayladı", "{name} ({no}) · {room} · {when}"],
    waiver_reminder: ["Feragatname hatırlatması", "{room} · {when} rezervasyonu için feragatnamenizi onaylayın."],
    reminder:        ["Yaklaşan rezervasyon", "{room} · {when}. Giriş kodu: {code}"],
    noshow:          ["Yoklama: gelmediniz olarak işaretlendiniz", "{room} · {when}. 30 gün içinde 2 kez gelmeyenler 14 gün rezervasyon yapamaz."],
  };

  // ---------- Yardımcılar ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name) => `<i class="ti ${name}" aria-hidden="true"></i>`;
  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const shiftDate = (iso, n) => { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n); return isoDate(d); };
  const mondayOf = (iso) => shiftDate(iso, -((new Date(iso + "T00:00").getDay() + 6) % 7));
  const dayName = (d, style = "long") => new Date(2024, 0, 7 + d).toLocaleDateString(loc(), { weekday: style });
  const fmtDate = (iso) => new Date(iso + "T00:00").toLocaleDateString(loc(), { day: "numeric", month: "long", weekday: "short" });
  const fmtDay = (iso) => new Date(iso + "T00:00").toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" });
  const fmtTs = (ts) => new Date(ts).toLocaleString(loc(), { dateStyle: "medium", timeStyle: "short" });
  const uid = () => Math.random().toString(36).slice(2, 9);
  const newCode = () => Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[O0I1]/g, "X");
  const cap1 = (s) => s.charAt(0).toLocaleUpperCase(loc()) + s.slice(1);
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* yok say */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.version === 3) return s; } catch { /* yok say */ } return window.SKS_SEED(); }
  function save() { safeSet(STORE_KEY, JSON.stringify(db)); }

  let db = load();
  let session = safeGet(SESSION_KEY);
  let ui = { adminTab: "rooms", editRoom: null, editTeam: null, flash: null, prefill: null, cal: null, apprTab: "pending", aq: "", as: "",
    selected: new Set(), checkDate: null, statRange: "30", statFrom: "", statTo: "", afterWaiver: null };

  // ---------- Veri erişimi ----------
  const me = () => (session ? db.users[session] : null);
  const myNo = () => me()?.number;
  const dir = (no) => db.directory[no] || null;
  const nameOf = (no) => dir(no)?.name || "";
  const userName = (u) => nameOf(u.number) || u.username;
  const room = (id) => db.rooms.find((r) => r.id === id);
  const roomName = (id) => room(id)?.name || t("Silinmiş alan");
  const team = (id) => db.teams.find((x) => x.id === id);
  const teamName = (r) => team(r.teamId)?.name || "";
  const people = (r) => 1 + r.participants.length;
  const isSigned = (r, no) => no === r.ownerNumber || r.signed.includes(no);
  const unsigned = (r) => r.participants.filter((no) => !r.signed.includes(no));
  const signedCount = (r) => people(r) - unsigned(r).length;
  const startTs = (r) => new Date(`${r.date}T${r.start}`).getTime();
  const isStaff = () => ["SKS", "ADMIN"].includes(me()?.role);
  const when = (r) => `${fmtDate(r.date)} ${r.start}–${r.end}`;
  const involves = (r, no) => r.ownerNumber === no || r.participants.includes(no);
  const partLabel = (r) => (room(r.roomId)?.divisible && r.part !== "full" ? ` · ${t(PARTS[r.part])}` : "");

  function waiverValid(u) {
    if (!u || u.waiverVersion !== db.waiverDoc.version || !u.waiverSignedAt) return false;
    const end = db.waiverDoc.validUntil, start = `${+end.slice(0, 4) - 1}-09-01`;
    const signed = isoDate(new Date(u.waiverSignedAt));
    return signed >= start && addDays(0) <= end;
  }

  function logAction(action, r, detail = "") {
    db.log.unshift({ id: uid(), at: Date.now(), by: me() ? userName(me()) : t("Sistem"), action, resId: r?.id || "", detail });
  }
  function notify(nos, kind, r, extra = {}) {
    const params = r ? { roomId: r.roomId, date: r.date, start: r.start, end: r.end, code: r.checkinCode, owner: r.ownerName, reason: r.reason, ...extra } : extra;
    for (const no of new Set(nos.filter(Boolean))) db.notifications.unshift({ id: uid(), to: no, at: Date.now(), kind, params, resId: r?.id || "", read: false });
  }
  function notifText(n) {
    const p = n.params || {};
    const vars = { ...p, room: p.roomId ? roomName(p.roomId) : "", when: p.date ? `${fmtDate(p.date)} ${p.start}–${p.end}` : "" };
    const [a, b] = NOTIF[n.kind] || [n.title || "", n.body || ""];
    return [t(a, vars), t(b, vars)];
  }

  // Gelmeme kayıtları ve yaptırım
  function noShowDates(no) {
    const since = addDays(-db.settings.noShowWindowDays);
    return db.reservations.filter((r) => ["COMPLETED", "NO_SHOW"].includes(r.status) && r.attendance && r.attendance[no] === false && r.date >= since)
      .map((r) => r.date).sort();
  }
  function banUntil(no) {
    const d = noShowDates(no);
    if (d.length < db.settings.noShowLimit) return null;
    const until = shiftDate(d[d.length - 1], db.settings.banDays);
    return until > addDays(0) ? until : null;
  }

  // ---------- Yönlendirme ----------
  const ROUTES = {
    home:      { title: "Ana sayfa",        roles: ["USER", "SKS", "ADMIN"], render: renderHome },
    waiver:    { title: "Feragatname",      roles: ["USER", "SKS", "ADMIN"], render: renderWaiver },
    inbox:     { title: "Bildirimler",      roles: ["USER", "SKS", "ADMIN"], render: renderInbox },
    new:       { title: "Yeni rezervasyon", roles: ["USER", "SKS", "ADMIN"], render: renderNew, nav: ["Yeni", "ti-calendar-plus"] },
    calendar:  { title: "Takvim",           roles: ["USER", "SKS", "ADMIN"], render: renderCalendar, nav: ["Takvim", "ti-calendar-week"] },
    mine:      { title: "Rezervasyonlarım", roles: ["USER", "SKS", "ADMIN"], render: renderMine, nav: ["Rezervasyonlarım", "ti-list-details"] },
    approvals: { title: "Onaylar",          roles: ["SKS", "ADMIN"],         render: renderApprovals, nav: ["Onaylar", "ti-checks"] },
    checkin:   { title: "Yoklama",          roles: ["SKS", "ADMIN"],         render: renderCheckin, nav: ["Yoklama", "ti-clipboard-check"] },
    stats:     { title: "Raporlar",         roles: ["SKS", "ADMIN"],         render: renderStats, nav: ["Raporlar", "ti-chart-bar"] },
    admin:     { title: "Yönetim",          roles: ["ADMIN"],                render: renderAdmin, nav: ["Yönetim", "ti-settings"] },
  };

  function go(route) { if (location.hash === "#" + route) render(); else location.hash = route; }
  window.addEventListener("hashchange", render);

  function render() {
    const app = $("#app");
    closeModal();
    document.documentElement.lang = LANG;
    if (!me()) { app.innerHTML = loginView(); bindLogin(); document.title = `${t("Giriş")} · ${t("SKS Rezervasyon Sistemi")}`; return; }
    remindUpcoming();
    let key = location.hash.slice(1) || "home";
    if (!ROUTES[key] || !ROUTES[key].roles.includes(me().role)) key = "home";
    // Geçerli feragatname olmadan hiçbir ekrana geçilemez
    if (!waiverValid(me()) && key !== "waiver") key = "waiver";
    const r = ROUTES[key];
    document.title = `${t(r.title)} · ${t("SKS Rezervasyon Sistemi")}`;
    const cls = ["waiver", "new", "home", "inbox"].includes(key) ? "narrow" : key === "calendar" ? "wide" : "";
    app.innerHTML = navView(key) + `<main class="${cls}">${r.render()}</main>
      <footer class="footer"><span><strong>Yaşar Üniversitesi</strong> · ${t("Sağlık, Kültür ve Spor")}</span>
        <span><a href="#waiver">${t("Feragatname ve KVKK")}</a> · ${t("SKS Rezervasyon Sistemi")} · ${t("prototip")}</span></footer>`;
    bindNav();
    r.bind?.();
    window.scrollTo(0, 0);
  }

  function inboxCount() {
    const no = myNo();
    return db.notifications.filter((n) => n.to === no && !n.read).length;
  }
  function myInvites() {
    const no = myNo();
    return db.reservations.filter((r) => ACTIVE.includes(r.status) && r.participants.includes(no) && !r.signed.includes(no) && r.date >= addDays(0));
  }

  function navView(active) {
    const u = me(), valid = waiverValid(u);
    const pending = db.reservations.filter((r) => r.status === "PENDING").length;
    const toCheck = db.reservations.filter((r) => r.status === "APPROVED" && r.date <= addDays(0)).length;
    const links = Object.entries(ROUTES)
      .filter(([, r]) => r.nav && r.roles.includes(u.role))
      .map(([k, r]) => {
        const n = k === "approvals" ? pending : k === "checkin" ? toCheck : 0;
        return `<a href="#${k}" class="${k === active ? "active" : ""}">${icon(r.nav[1])}${t(r.nav[0])}${n ? `<span class="count">${n}</span>` : ""}</a>`;
      }).join("");
    const unread = inboxCount() + myInvites().length;
    return `
      <header class="topnav"><div class="topnav-inner">
        <a href="#home" class="brand">
          <span class="brand-mark">${icon("ti-barbell")}</span><span>${t("SKS Rezervasyon Sistemi")}<small>Yaşar Üniversitesi</small></span>
        </a>
        <nav class="nav" aria-label="${t("Ana menü")}">${valid ? links : ""}</nav>
        <div class="userbox">
          ${valid ? `<a href="#inbox" class="btn btn-ghost bell ${active === "inbox" ? "on" : ""}" title="${t("Bildirimler")}" aria-label="${t("Bildirimler")}">${icon("ti-bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</a>` : ""}
          <button class="btn btn-ghost lang" id="langBtn" title="${LANG === "en" ? "Türkçe" : "English"}">${LANG === "en" ? "TR" : "EN"}</button>
          <div class="who">${esc(userName(u))}<small>${t(ROLES[u.role])}</small></div>
          <button class="btn btn-ghost" id="logout" title="${t("Çıkış")}">${icon("ti-logout")}<span class="sr">${t("Çıkış")}</span></button>
        </div>
      </div></header>`;
  }
  function bindNav() {
    $("#logout").onclick = () => { session = null; safeSet(SESSION_KEY, null); history.replaceState(null, "", location.pathname); render(); };
    bindLang();
  }
  function bindLang() {
    const b = $("#langBtn");
    if (b) b.onclick = () => { LANG = LANG === "en" ? "tr" : "en"; safeSet("sks-lang", LANG); render(); };
  }

  function toast(msg) {
    $$(".toast").forEach((x) => x.remove());
    const el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  const alertBox = (kind, ic, html) => `<div class="alert alert-${kind}" role="${kind === "danger" ? "alert" : "status"}">${icon(ic)}<div>${html}</div></div>`;
  const statusBadge = (s) => `<span class="badge ${STATUS[s].cls}">${icon(STATUS[s].icon)}${t(STATUS[s].label)}</span>`;

  // Yaklaşan (24 saat içindeki) onaylı rezervasyonlar için hatırlatma
  function remindUpcoming() {
    const no = myNo(), now = Date.now();
    let changed = false;
    for (const r of db.reservations) {
      if (r.status !== "APPROVED" || !involves(r, no)) continue;
      const s = startTs(r);
      if (s < now || s - now > 86400000) continue;
      if (db.notifications.some((n) => n.kind === "reminder" && n.resId === r.id && n.to === no)) continue;
      notify([no], "reminder", r); changed = true;
    }
    if (changed) save();
  }

  // ---------- 1. Giriş ----------
  function loginView(error) {
    return `
      <div class="login-wrap"><div class="card login">
        <div class="login-head">
          <div class="login-top"><div class="uni">Yaşar Üniversitesi</div>
            <button class="btn btn-ghost lang" id="langBtn" type="button">${LANG === "en" ? "TR" : "EN"}</button></div>
          <div class="brand-mark">${icon("ti-barbell")}</div>
          <h1>${t("SKS Rezervasyon Sistemi")}</h1>
          <p class="muted">${t("Sağlık, Kültür ve Spor tesisleri rezervasyonu")}</p>
        </div>
        <div class="login-body">
        <p class="muted small" style="margin-bottom:14px">${t("Üniversite hesabınızla giriş yapın.")}</p>
        <div id="loginError">${error ? alertBox("danger", "ti-alert-circle", esc(error)) : ""}</div>
        <form id="loginForm" novalidate>
          <div class="field"><label for="lu">${t("Kullanıcı adı")}</label>
            <input class="input" id="lu" autocomplete="username" autocapitalize="off" placeholder="ad.soyad"></div>
          <div class="field"><label for="lp">${t("Şifre")}</label>
            <input class="input" id="lp" type="password" autocomplete="current-password"></div>
          <button class="btn btn-primary btn-block" type="submit">${t("Giriş yap")}</button>
        </form>
        <div class="demo-hint">${t("Prototip: herhangi bir şifreyle girin. Bu bir demodur, gerçek şifrenizi yazmayın.")}
          <ul>
            <li><code>ogrenci</code> — ${t("öğrenci, dans topluluğu kaptanı")}</li>
            <li><code>kaptan</code> — ${t("öğrenci, voleybol takımı kaptanı")}</li>
            <li><code>sks</code> — ${t("SKS onaylayıcı")}</li>
            <li><code>admin</code> — ${t("yönetici")}</li>
          </ul>
        </div>
        </div>
      </div></div>`;
  }
  function bindLogin() {
    bindLang();
    $("#loginForm").onsubmit = (e) => {
      e.preventDefault();
      const u = $("#lu").value.trim().toLowerCase(), p = $("#lp").value;
      let err = "";
      if (!u || !p) err = t("Kullanıcı adı ve şifre gerekli.");
      else if (!db.users[u]) err = t("Kullanıcı adı veya şifre hatalı.");
      if (err) { $("#loginError").innerHTML = alertBox("danger", "ti-alert-circle", err); return; }
      session = u; safeSet(SESSION_KEY, u);
      go(waiverValid(me()) ? "home" : "waiver");
    };
  }

  // ---------- 2. Ana sayfa ----------
  function renderHome() {
    ROUTES.home.bind = () => bindResRows();
    const u = me(), no = u.number;
    const upcoming = db.reservations.filter((r) => r.ownerNumber === no && ACTIVE.includes(r.status) && r.date >= addDays(0))
      .sort((a, b) => startTs(a) - startTs(b));
    const invites = myInvites(), ban = banUntil(no), ns = noShowDates(no).length;
    return `
      <h1 class="page-head">${t("Hoş geldiniz, {name}", { name: esc(userName(u).split(" ")[0]) })}</h1>
      <p class="page-sub">${t("Spor alanları için rezervasyon talebi oluşturabilir, taleplerinizin durumunu izleyebilirsiniz.")}</p>
      ${ban ? alertBox("danger", "ti-ban", t("Son {d} günde {n} kez rezervasyonunuza gelmediğiniz için {date} tarihine kadar yeni talep oluşturamazsınız.", { d: db.settings.noShowWindowDays, n: ns, date: fmtDay(ban) })) : ""}
      ${invites.length ? `<a class="alert alert-warning invite-banner" href="#inbox">${icon("ti-mail-opened")}<div>${t("{n} katılımcı davetiniz var. Feragatnameyi onaylamak için tıklayın.", { n: invites.length })}</div></a>` : ""}
      <div class="tiles">
        <a class="tile" href="#new"><span class="tile-icon">${icon("ti-calendar-plus")}</span>
          <span><strong>${t("Yeni rezervasyon")}</strong><span class="muted small">${t("Alan, tarih ve saat seçin")}</span></span></a>
        <a class="tile" href="#mine"><span class="tile-icon">${icon("ti-list-details")}</span>
          <span><strong>${t("Rezervasyonlarım")}</strong><span class="muted small">${upcoming.length ? t("{n} aktif talep", { n: upcoming.length }) : t("Aktif talebiniz yok")}</span></span></a>
        <a class="tile" href="#calendar"><span class="tile-icon">${icon("ti-calendar-week")}</span>
          <span><strong>${t("Doluluk takvimi")}</strong><span class="muted small">${t("Boş saatleri görün")}</span></span></a>
        <a class="tile" href="#waiver"><span class="tile-icon">${icon("ti-file-certificate")}</span>
          <span><strong>${t("Feragatname ve KVKK")}</strong><span class="muted small">${t("Geçerli: {date} tarihine kadar", { date: fmtDay(db.waiverDoc.validUntil) })}</span></span></a>
      </div>
      ${upcoming.length ? `<h2 class="section-title">${t("Yaklaşan rezervasyonlarınız")}</h2><div class="stack">${upcoming.slice(0, 3).map(resRow).join("")}</div>` : ""}`;
  }

  // ---------- 3. Feragatname ve KVKK ----------
  function renderWaiver() {
    const u = me(), valid = waiverValid(u), doc = db.waiverDoc;
    ROUTES.waiver.bind = () => {
      if (valid) return;
      const btn = $("#wSign"), boxes = $$(".wcheck");
      boxes.forEach((b) => b.onchange = () => { btn.disabled = !boxes.every((x) => x.checked); });
      btn.onclick = () => {
        u.waiverVersion = doc.version; u.waiverSignedAt = Date.now(); save();
        toast(t("Feragatname imzalandı."));
        const next = ui.afterWaiver; ui.afterWaiver = null;
        if (next) { acceptInvite(next); go("inbox"); } else go("home");
      };
    };
    const outdated = u.waiverVersion && u.waiverVersion !== doc.version;
    return `
      <div class="card">
        <div class="page-head" style="justify-content:space-between;flex-wrap:wrap">
          <h1>${t("Sağlık feragatnamesi")}</h1>
          <span class="badge b-neutral">${t("Sürüm {v}", { v: doc.version })} · ${t("{date} tarihine kadar geçerli", { date: fmtDay(doc.validUntil) })}</span>
        </div>
        <p class="muted" style="margin-top:4px">${t("Spor tesislerini kullanmadan önce usul ve esasları okuyup onaylamanız gerekir.")}</p>
        ${outdated && !valid ? alertBox("warning", "ti-refresh", t("Feragatname metni güncellendi. Devam etmek için yeni sürümü onaylamanız gerekiyor.")) : ""}
        ${ui.afterWaiver ? alertBox("warning", "ti-mail-opened", t("Katılımcı davetini onaylamak için önce feragatnameyi imzalayın.")) : ""}
        ${LANG === "en" ? `<p class="small muted">${icon("ti-language")} The waiver and privacy notice are legal texts provided in Turkish.</p>` : ""}
        <div class="waiver-text" tabindex="0" aria-label="${t("Usul ve esaslar")}">
          <ol>${doc.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        </div>
        <details class="kvkk" ${valid ? "" : "open"}>
          <summary>${icon("ti-shield-lock")}${t("KVKK aydınlatma metni")}</summary>
          <ul>${doc.kvkk.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <p class="small muted">${t("Bu metinler örnektir; kullanılmadan önce üniversitenin hukuk birimince onaylanmalıdır.")}</p>
        </details>
        ${valid
          ? alertBox("success", "ti-circle-check", t("Feragatnameyi {date} tarihinde imzaladınız. {until} tarihine kadar geçerlidir.", { date: fmtTs(u.waiverSignedAt), until: fmtDay(doc.validUntil) }))
          : `<div class="checks">
               <label class="check"><input type="checkbox" class="wcheck"><span>${t("Usul ve esasları okudum, kabul ediyorum.")}</span></label>
               <label class="check"><input type="checkbox" class="wcheck"><span>${t("KVKK aydınlatma metnini okudum.")}</span></label>
               <label class="check"><input type="checkbox" class="wcheck"><span>${t("Sağlık beyanımın tesis kullanımı amacıyla işlenmesine açık rıza veriyorum.")}</span></label>
             </div>
             <button class="btn btn-primary btn-block" id="wSign" disabled>${t("İmzala ve devam et")}</button>`}
      </div>`;
  }

  // ---------- Bildirimler ve davetler ----------
  function acceptInvite(id) {
    const r = db.reservations.find((x) => x.id === id), no = myNo();
    if (!r || r.signed.includes(no)) return;
    r.signed.push(no);
    logAction("INVITE_ACCEPTED", r, `${nameOf(no)} (${no})`);
    notify([r.ownerNumber], "accepted", r, { name: nameOf(no), no });
    save(); toast(t("Feragatname onaylandı, katılımınız kaydedildi."));
  }
  function renderInbox() {
    const no = myNo();
    ROUTES.inbox.bind = () => {
      db.notifications.forEach((n) => { if (n.to === no) n.read = true; }); save();
      $$("[data-accept]").forEach((b) => b.onclick = () => {
        if (!waiverValid(me())) { ui.afterWaiver = b.dataset.accept; go("waiver"); return; }
        acceptInvite(b.dataset.accept); render();
      });
      $$("[data-decline]").forEach((b) => b.onclick = () => {
        const r = db.reservations.find((x) => x.id === b.dataset.decline);
        if (!confirm(t("Bu rezervasyona katılmayacağınızı onaylıyor musunuz?"))) return;
        r.participants = r.participants.filter((x) => x !== no);
        logAction("INVITE_DECLINED", r, `${nameOf(no)} (${no})`);
        notify([r.ownerNumber], "declined", r, { name: nameOf(no), no });
        save(); toast(t("Davet reddedildi.")); render();
      });
      $$("[data-nres]").forEach((b) => b.onclick = () => openDetail(b.dataset.nres));
    };
    const invites = myInvites();
    const list = db.notifications.filter((n) => n.to === no).sort((a, b) => b.at - a.at);
    const email = dir(no)?.email;
    return `
      <h1 class="page-head">${t("Bildirimler")}</h1>
      <p class="page-sub">${email ? t("Bildirimler ayrıca {email} adresine e-posta olarak gönderilir.", { email: `<b class="mono">${esc(email)}</b>` }) : ""}</p>
      ${invites.length ? `<h2 class="section-title">${t("Katılımcı davetleri")}</h2>
      <div class="stack" style="margin-bottom:20px">${invites.map((r) => `
        <article class="card invite">
          <div><div class="title">${esc(roomName(r.roomId))}${partLabel(r)}</div>
            <div class="meta muted small"><span>${icon("ti-calendar")}${when(r)}</span><span>${icon("ti-user")}${t("Davet eden: {name}", { name: esc(r.ownerName) })}</span>
              ${r.teamId ? `<span>${icon("ti-users-group")}${esc(teamName(r))}</span>` : ""}</div></div>
          <div class="btn-row">
            <button class="btn btn-primary" data-accept="${r.id}">${icon("ti-signature")}${t("Feragatnameyi onayla ve katıl")}</button>
            <button class="btn btn-outline" data-decline="${r.id}">${t("Katılmayacağım")}</button>
          </div>
        </article>`).join("")}</div>` : ""}
      <h2 class="section-title">${t("Son bildirimler")}</h2>
      <div class="card flush"><div class="list">${list.length ? list.slice(0, 40).map((n) => {
        const [title, body] = notifText(n);
        return `<button class="list-item notif ${n.read ? "" : "unread"}" ${n.resId ? `data-nres="${n.resId}"` : ""}>
          <div><div class="title">${esc(title)}</div><div class="meta">${esc(body)}</div></div>
          <div class="side small muted">${fmtTs(n.at)}${email ? `<span class="mail">${icon("ti-mail")}${t("e-posta")}</span>` : ""}</div></button>`;
      }).join("") : `<div class="list-item muted">${t("Bildirim yok.")}</div>`}</div></div>`;
  }

  // ---------- 4. Yeni rezervasyon ----------
  let draftChips = [];
  function myTeams() {
    const no = myNo();
    return db.teams.filter((x) => x.captain === no || x.coach === no);
  }
  function renderNew() {
    ROUTES.new.bind = bindNew;
    draftChips = [];
    const flash = ui.flash; ui.flash = null;
    const pf = ui.prefill || { roomId: "", date: addDays(1), start: "18:00", end: "19:00" }; ui.prefill = null;
    const teams = myTeams(), ban = banUntil(myNo()), s = db.settings;
    return `
      <h1 class="page-head">${t("Yeni rezervasyon")}</h1>
      <p class="page-sub">${t("Talebiniz SKS onayından sonra kesinleşir.")}</p>
      ${ban ? alertBox("danger", "ti-ban", t("Son {d} günde {n} kez rezervasyonunuza gelmediğiniz için {date} tarihine kadar yeni talep oluşturamazsınız.", { d: s.noShowWindowDays, n: noShowDates(myNo()).length, date: fmtDay(ban) })) : ""}
      <form class="card" id="newForm" novalidate>
        <div id="newMsg">${flash || ""}</div>
        <div class="field"><label for="nRoom">${t("Alan")}</label>
          <select class="input" id="nRoom">
            <option value="">${t("Alan seçin")}</option>
            ${db.rooms.map((r) => `<option value="${r.id}" ${pf.roomId === r.id ? "selected" : ""}>${esc(r.name)} (${t(MODES[r.mode])} · ${t("{n} kişi", { n: r.capacity })})</option>`).join("")}
          </select>
          <div id="nRoomInfo"></div>
        </div>
        <div class="field" id="nPartWrap" hidden><label for="nPart">${t("Salon kullanımı")}</label>
          <select class="input" id="nPart">${Object.entries(PARTS).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select>
        </div>
        <div class="grid-3 form-row">
          <div class="field"><label for="nDate">${t("Tarih")}</label><input class="input" type="date" id="nDate" min="${addDays(0)}" max="${addDays(s.maxDaysAhead)}" value="${pf.date}"></div>
          <div class="field"><label for="nStart">${t("Başlangıç")}</label><input class="input" type="time" id="nStart" step="900" value="${pf.start}"></div>
          <div class="field"><label for="nEnd">${t("Bitiş")}</label><input class="input" type="time" id="nEnd" step="900" value="${pf.end}"></div>
        </div>
        <div id="nBusy" class="busy" aria-live="polite"></div>
        <div class="field"><label for="nTeam">${t("Takım")} <span class="muted">(${t("opsiyonel")})</span></label>
          <select class="input" id="nTeam">
            <option value="">${t("— Bireysel —")}</option>
            ${teams.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}
          </select>
          <p class="hint">${icon("ti-info-circle")}${teams.length ? t("Takım adına yalnızca kaptan ve antrenör talep açabilir.") : t("Takım adına talep açma yetkiniz yok (yalnızca kaptan ve antrenör).")}</p>
        </div>
        <div id="nRepeat" class="repeat" hidden>
          <label class="check"><input type="checkbox" id="nRepeatOn"><span>${t("Her hafta aynı gün ve saatte tekrarla")}</span></label>
          <div class="field" id="nUntilWrap" hidden style="margin:10px 0 0"><label for="nUntil">${t("Son tarih (dönem sonuna kadar)")}</label>
            <input class="input" type="date" id="nUntil" max="${s.semesterEnd}" value="${s.semesterEnd}"></div>
        </div>
        <div class="field"><label for="nChipInput">${t("Yanınızdaki öğrenci numaraları")}</label>
          <div class="chips" id="nChips"></div>
          <p class="hint">${icon("ti-mail")}${t("Her katılımcıya feragatname daveti gönderilecek")}</p>
        </div>
        <details class="rules">
          <summary>${icon("ti-list-check")}${t("Rezervasyon kuralları")}</summary>
          <ul>
            <li>${t("En az {h} saat önceden, en çok {d} gün sonrası için talep oluşturulabilir.", { h: s.minLeadHours, d: s.maxDaysAhead })}</li>
            <li>${t("Bir rezervasyon en fazla {h} saat olabilir.", { h: s.maxDurationMin / 60 })}</li>
            <li>${t("Haftada en fazla {n} aktif bireysel talep açılabilir.", { n: s.weeklyQuota })}</li>
            <li>${t("Rezervasyona {h} saat kalana kadar iptal edilebilir.", { h: s.cancelHours })}</li>
            <li>${t("{d} gün içinde {n} kez gelmeyenler {b} gün talep oluşturamaz.", { d: s.noShowWindowDays, n: s.noShowLimit, b: s.banDays })}</li>
            <li>${t("Aynı kişi aynı saatte iki rezervasyonda yer alamaz.")}</li>
          </ul>
        </details>
        <div id="nNote"></div>
        <button class="btn btn-primary btn-block" type="submit" ${ban ? "disabled" : ""}>${icon("ti-send")}${t("Rezervasyon talebi gönder")}</button>
      </form>`;
  }

  function drawChips() {
    const box = $("#nChips");
    const old = $("#nChipInput");
    if (old) old.onblur = null;
    box.innerHTML = draftChips.map((n, i) =>
      `<span class="chip" title="${esc(nameOf(n))}">${esc(n)}<small>${esc(nameOf(n).split(" ")[0] || "")}</small><button type="button" data-i="${i}" aria-label="${esc(t("{no} numarasını kaldır", { no: n }))}">${icon("ti-x")}</button></span>`).join("") +
      `<input id="nChipInput" inputmode="numeric" placeholder="${draftChips.length ? "" : t("Numara yazıp Enter'a basın")}">`;
    const input = $("#nChipInput");
    box.querySelectorAll("button[data-i]").forEach((b) => b.onclick = () => { draftChips.splice(+b.dataset.i, 1); drawChips(); $("#nChipInput").focus(); });
    const commit = () => {
      const parts = input.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      input.value = "";
      const bad = [];
      for (const v of parts) {
        if (!/^\d{6,12}$/.test(v)) { bad.push(t("{v}: öğrenci numarası 6–12 haneli olmalı", { v })); continue; }
        if (!dir(v)) { bad.push(t("{v}: öğrenci bilgi sisteminde bulunamadı", { v })); continue; }
        if (v === myNo()) continue;
        if (!draftChips.includes(v)) draftChips.push(v);
      }
      if (parts.length) { drawChips(); $("#nChipInput").focus(); }
      if (bad.length) toast(bad.join(" · "));
    };
    input.onkeydown = (e) => {
      if (["Enter", ",", " ", "Tab"].includes(e.key) && input.value.trim()) { e.preventDefault(); commit(); }
      else if (e.key === "Backspace" && !input.value && draftChips.length) { draftChips.pop(); drawChips(); $("#nChipInput").focus(); }
    };
    input.onblur = () => { if (input.value.trim()) commit(); };
    box.onclick = (e) => { if (e.target === box) input.focus(); };
  }

  // Seçilen alan ve gün için açık saatler ve dolu aralıklar
  function busyHtml(roomId, date) {
    const r = room(roomId);
    if (!r || !date) return "";
    const calLink = `<a href="#calendar" data-cal-room="${r.id}" data-cal-date="${date}">${icon("ti-calendar-week")}${t("Takvimde gör")}</a>`;
    const closed = db.closures.find((c) => date >= c.start && date <= c.end);
    if (closed) return `<div class="busy-head"><span class="badge b-neutral">${icon("ti-lock")}${t("Kapalı")}: ${esc(closed.reason)}</span>${calLink}</div>`;
    const day = new Date(date + "T00:00").getDay();
    const open = db.hours.filter((h) => h.roomId === r.id && h.day === day).sort((a, b) => a.open.localeCompare(b.open));
    if (!open.length) return `<div class="busy-head"><span class="badge b-neutral">${icon("ti-lock")}${t("{day} günleri kapalı", { day: cap1(dayName(day)) })}</span>${calLink}</div>`;
    const taken = activeOn(r.id, date);
    return `
      <div class="busy-head"><span class="muted small">${icon("ti-clock")} ${t("Açık")}: ${open.map((h) => `${h.open}–${h.close}${h.audience !== "all" ? ` (${t(AUDIENCE[h.audience])})` : ""}`).join(", ")}</span>${calLink}</div>
      <div class="busy-list">${taken.length
        ? taken.map((x) => `<span class="badge ${x.status === "PENDING" ? "b-warning" : "b-success"}" title="${t(STATUS[x.status].label)}">${x.start}–${x.end}${r.mode === "shared" ? ` · ${t("{n} kişi", { n: people(x) })}` : ""}${r.divisible && x.part !== "full" ? ` · ${x.part}` : ""}</span>`).join("")
        : `<span class="badge b-accent">${icon("ti-circle-check")}${t("Bu gün henüz talep yok")}</span>`}</div>`;
  }
  const activeOn = (roomId, date) => db.reservations
    .filter((x) => x.roomId === roomId && x.date === date && ["PENDING", "APPROVED", "COMPLETED"].includes(x.status))
    .sort((a, b) => a.start.localeCompare(b.start));

  function bindCalLinks(root = document) {
    root.querySelectorAll("[data-cal-room]").forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      ui.cal = { view: "week", roomId: a.dataset.calRoom, date: a.dataset.calDate };
      go("calendar");
    });
  }

  function roomInfoHtml(r) {
    return `<div class="room-info">
      ${r.location ? `<span>${icon("ti-map-pin")}${esc(r.location)}</span>` : ""}
      <button type="button" class="linkbtn" data-room-info="${r.id}">${icon("ti-info-circle")}${t("Alan bilgisi ve kurallar")}</button></div>`;
  }
  function openRoomInfo(id) {
    const r = room(id);
    const hrs = db.hours.filter((h) => h.roomId === id).sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.open.localeCompare(b.open));
    openModal(`
      <div class="modal-head"><div><h2 id="mTitle">${esc(r.name)}</h2><div class="meta muted small">${esc(t(r.type))} · ${t(MODES[r.mode])} · ${t("{n} kişi", { n: r.capacity })}${r.divisible ? ` · ${t("ikiye bölünebilir")}` : ""}</div></div>
        <button class="btn btn-ghost" data-close aria-label="${t("Kapat")}">${icon("ti-x")}</button></div>
      <div class="modal-body">
        <div class="detail-grid">
          <div><div class="label">${t("Konum")}</div>${esc(r.location || "—")}</div>
          <div><div class="label">${t("Onay")}</div>${r.autoApprove ? t("Bireysel talepler otomatik onaylanır") : t("SKS onayı gerekir")}</div>
        </div>
        <div class="label">${t("Ekipman")}</div><p>${esc(r.equipment || "—")}</p>
        <div class="label">${t("Kurallar")}</div><p>${esc(r.rules || "—")}</p>
        <div class="label">${t("Açık saatler")}</div>
        <ul class="hours-list">${hrs.map((h) => `<li><span>${cap1(dayName(h.day))}</span><span>${h.open}–${h.close}${h.audience !== "all" ? ` <span class="badge b-accent">${t(AUDIENCE[h.audience])}</span>` : ""}</span></li>`).join("")}</ul>
      </div>`);
  }
  function bindRoomInfo(root = document) { root.querySelectorAll("[data-room-info]").forEach((b) => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRoomInfo(b.dataset.roomInfo); }); }

  function bindNew() {
    const refresh = () => {
      const r = room($("#nRoom").value);
      $("#nBusy").innerHTML = busyHtml($("#nRoom").value, $("#nDate").value); bindCalLinks($("#nBusy"));
      $("#nRoomInfo").innerHTML = r ? roomInfoHtml(r) : ""; bindRoomInfo($("#nRoomInfo"));
      $("#nPartWrap").hidden = !r?.divisible;
      const teamId = $("#nTeam").value;
      $("#nRepeat").hidden = !teamId;
      $("#nUntilWrap").hidden = !$("#nRepeatOn").checked;
      $("#nDate").max = teamId && $("#nRepeatOn").checked ? db.settings.semesterEnd : addDays(db.settings.maxDaysAhead);
      $("#nNote").innerHTML = r && r.autoApprove && !teamId
        ? alertBox("success", "ti-bolt", t("{room} için bireysel talepler otomatik onaylanır.", { room: esc(r.name) }))
        : alertBox("warning", "ti-info-circle", t("Talebiniz SKS onayına kadar ön rezervasyon olarak görünecek."));
    };
    $("#nRoom").onchange = refresh; $("#nDate").onchange = refresh; $("#nRepeatOn").onchange = refresh;
    $("#nTeam").onchange = () => {
      const tm = team($("#nTeam").value);
      if (tm) { draftChips = [...new Set([...draftChips, ...tm.members.filter((x) => x !== myNo())])]; drawChips(); toast(t("Takım üyeleri katılımcı olarak eklendi.")); }
      refresh();
    };
    refresh();
    drawChips();
    $("#newForm").onsubmit = (e) => {
      e.preventDefault();
      const f = { roomId: $("#nRoom").value, date: $("#nDate").value, start: $("#nStart").value, end: $("#nEnd").value, teamId: $("#nTeam").value,
        part: room($("#nRoom").value)?.divisible ? $("#nPart").value : "full" };
      if ($("#nChipInput").value.trim()) { toast(t("Yazdığınız numarayı eklemek için Enter'a basın.")); return; }
      const repeat = f.teamId && $("#nRepeatOn").checked;
      const showErr = (msg) => { $("#newMsg").innerHTML = alertBox("danger", "ti-alert-circle", msg); $("#newMsg").scrollIntoView({ block: "center" }); };
      const first = validate(f, draftChips, {});
      if (first) return showErr(first);
      const r0 = room(f.roomId), auto = r0.autoApprove && !f.teamId;
      const dates = [f.date], skipped = [];
      if (repeat) {
        const until = $("#nUntil").value || db.settings.semesterEnd;
        for (let d = shiftDate(f.date, 7); d <= until && d <= db.settings.semesterEnd; d = shiftDate(d, 7)) {
          const err = validate({ ...f, date: d }, draftChips, { series: true });
          if (err) skipped.push(`${fmtDate(d)}: ${err}`); else dates.push(d);
        }
      }
      const seriesId = dates.length > 1 ? uid() : "";
      const created = dates.map((date) => {
        const r = { id: uid(), owner: me().username, ownerName: userName(me()), ownerNumber: myNo(), ...f, date, participants: [...draftChips], signed: [],
          status: auto ? "APPROVED" : "PENDING", reason: "", attendance: null, seriesId, checkinCode: newCode(), createdAt: Date.now(),
          decidedBy: auto ? t("Otomatik onay") : "" };
        db.reservations.unshift(r);
        logAction("CREATED", r);
        if (auto) logAction("AUTO_APPROVED", r);
        return r;
      });
      const r = created[0];
      notify([myNo()], auto ? "auto" : "created", r);
      notify(draftChips, "invite", r);
      save();
      ui.flash = alertBox("success", "ti-circle-check",
        (auto ? t("Rezervasyonunuz onaylandı: {room}, {when}. Giriş kodunuz: {code}", { room: `<b>${esc(r0.name)}</b>`, when: when(r), code: `<b class="mono">${r.checkinCode}</b>` })
          : t("Talebiniz alındı: {room}, {when}.", { room: `<b>${esc(r0.name)}</b>`, when: when(r) })) +
        (created.length > 1 ? " " + t("Tekrarlayan seri: {n} hafta.", { n: created.length }) : "") + " " +
        t("Durumunu {link} sayfasından izleyebilirsiniz.", { link: `<a href="#mine">${t("Rezervasyonlarım")}</a>` }) +
        (draftChips.length ? " " + t("{n} katılımcıya feragatname daveti gönderildi.", { n: draftChips.length }) : "") +
        (skipped.length ? `<details class="skipped"><summary>${t("{n} hafta eklenemedi", { n: skipped.length })}</summary><ul>${skipped.map((x) => `<li>${x}</li>`).join("")}</ul></details>` : ""));
      draftChips = [];
      render();
    };
  }

  // Talep kuralları; ilk hatayı döndürür
  function validate(f, chips, opt = {}) {
    const s = db.settings, no = myNo();
    if (!f.roomId) return t("Lütfen bir alan seçin.");
    if (!f.date || !f.start || !f.end) return t("Tarih, başlangıç ve bitiş saati gerekli.");
    const ban = banUntil(no);
    if (ban) return t("{date} tarihine kadar yeni talep oluşturamazsınız (gelmeme yaptırımı).", { date: fmtDay(ban) });
    if (toMin(f.end) <= toMin(f.start)) return t("Bitiş saati başlangıçtan sonra olmalı.");
    if (toMin(f.end) - toMin(f.start) > s.maxDurationMin) return t("Bir rezervasyon en fazla {h} saat olabilir.", { h: s.maxDurationMin / 60 });
    const start = new Date(`${f.date}T${f.start}`).getTime();
    if (start < Date.now() + s.minLeadHours * 3600000) return t("Rezervasyon en az {h} saat önceden yapılmalı.", { h: s.minLeadHours });
    if (!opt.series && f.date > addDays(s.maxDaysAhead)) return t("En çok {d} gün sonrası için talep oluşturulabilir.", { d: s.maxDaysAhead });
    const r = room(f.roomId);
    const closed = db.closures.find((c) => f.date >= c.start && f.date <= c.end);
    if (closed) return t("Tesis bu tarihte kapalı: {reason}.", { reason: esc(closed.reason) });
    const day = new Date(f.date + "T00:00").getDay();
    const slots = db.hours.filter((h) => h.roomId === r.id && h.day === day);
    if (!slots.length) return t("{room} {day} günleri kapalı.", { room: esc(r.name), day: dayName(day) });
    const slot = slots.find((h) => toMin(f.start) >= toMin(h.open) && toMin(f.end) <= toMin(h.close));
    if (!slot) return t("{room} açık saatleri: {hours}.", { room: esc(r.name), hours: slots.map((h) => `${h.open}–${h.close}`).join(", ") });
    // Özel kullanım saatleri
    const everyone = [no, ...chips];
    if (slot.audience === "staff" && everyone.some((x) => dir(x)?.type !== "staff")) return t("{h} arası personel saatidir; yalnızca personel katılabilir.", { h: `${slot.open}–${slot.close}` });
    if (slot.audience === "student" && everyone.some((x) => dir(x)?.type !== "student")) return t("{h} arası yalnızca öğrencilere açıktır.", { h: `${slot.open}–${slot.close}` });
    if (slot.audience === "women" && everyone.some((x) => dir(x)?.gender !== "F")) return t("{h} arası kadınlara özel saattir.", { h: `${slot.open}–${slot.close}` });
    // Kapasite
    const count = 1 + chips.length;
    const capacity = r.divisible && f.part !== "full" ? Math.floor(r.capacity / 2) : r.capacity;
    if (count > capacity) return t("Kişi sayısı ({n}) alan kapasitesini ({c}) aşıyor.", { n: count, c: capacity });
    const overlapsTime = (x) => x.date === f.date && toMin(x.start) < toMin(f.end) && toMin(f.start) < toMin(x.end);
    const overlap = db.reservations.filter((x) => x.roomId === r.id && ACTIVE.includes(x.status) && overlapsTime(x));
    if (r.mode === "exclusive") {
      const clash = overlap.filter((x) => !r.divisible || x.part === "full" || f.part === "full" || x.part === f.part);
      if (clash.length) return t("Bu saat aralığında {room} dolu ({t}). Başka bir saat seçin.", { room: esc(r.name), t: clash.map((x) => `${x.start}–${x.end}`).join(", ") });
    } else {
      const used = overlap.reduce((sum, x) => sum + people(x), 0);
      if (used + count > r.capacity) return t("Bu saatte yalnızca {n} kişilik yer kaldı.", { n: Math.max(0, r.capacity - used) });
    }
    // Aynı kişi aynı saatte iki rezervasyonda olamaz
    for (const x of db.reservations.filter((y) => ACTIVE.includes(y.status) && overlapsTime(y))) {
      const both = everyone.filter((p) => involves(x, p));
      if (both.length) return t("{who} aynı saatte başka bir rezervasyonda yer alıyor ({room}, {t}).", { who: both.map((p) => `${esc(nameOf(p) || p)}`).join(", "), room: esc(roomName(x.roomId)), t: `${x.start}–${x.end}` });
    }
    // Haftalık kota (takım talepleri hariç)
    if (!f.teamId) {
      const wk = mondayOf(f.date);
      const n = db.reservations.filter((x) => x.ownerNumber === no && !x.teamId && ACTIVE.includes(x.status) && mondayOf(x.date) === wk).length;
      if (n >= s.weeklyQuota) return t("Bu hafta için {n} aktif bireysel talep sınırına ulaştınız.", { n: s.weeklyQuota });
    }
    return "";
  }

  // ---------- Pencere (modal) ----------
  function closeModal() { $(".modal-wrap")?.remove(); document.removeEventListener("keydown", modalKey); }
  function modalKey(e) { if (e.key === "Escape") closeModal(); }
  function openModal(html, wide = false) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="mTitle">${html}</div>`;
    wrap.onclick = (e) => { if (e.target === wrap || e.target.closest("[data-close]")) closeModal(); };
    document.body.appendChild(wrap);
    document.addEventListener("keydown", modalKey);
    wrap.querySelector("[data-close]")?.focus();
    return wrap;
  }

  // ---------- Onay / red / iptal ----------
  function approveList(list) {
    const missing = list.reduce((n, r) => n + unsigned(r).length, 0);
    if (missing && !confirm(t("{n} katılımcının feragatnamesi eksik. Yine de onaylansın mı?", { n: missing }))) return false;
    for (const r of list) {
      r.status = "APPROVED"; r.decidedBy = userName(me()); r.decidedAt = Date.now();
      logAction("APPROVED", r, missing ? t("{n} feragatname eksikken onaylandı", { n: unsigned(r).length }) : "");
    }
    notify([list[0].ownerNumber, ...list[0].participants], "approved", list[0]);
    save(); closeModal(); toast(list.length > 1 ? t("{n} rezervasyon onaylandı.", { n: list.length }) : t("Rezervasyon onaylandı."));
    render(); return true;
  }
  function rejectList(list, reason) {
    for (const r of list) { r.status = "REJECTED"; r.reason = reason; r.decidedBy = userName(me()); r.decidedAt = Date.now(); logAction("REJECTED", r, reason); }
    notify([list[0].ownerNumber, ...list[0].participants], "rejected", list[0]);
    save(); closeModal(); toast(t("Talep reddedildi.")); render();
  }
  function staffCancel(r, reason) {
    r.status = "CANCELLED"; r.reason = reason; r.cancelledBy = userName(me());
    logAction("CANCELLED_STAFF", r, reason);
    notify([r.ownerNumber, ...r.participants], "cancelled_staff", r);
    save(); closeModal(); toast(t("Rezervasyon iptal edildi ve katılımcılara bildirildi.")); render();
  }
  function ownerCancel(r) {
    if (!confirm(t("Bu rezervasyonu iptal etmek istiyor musunuz?"))) return;
    r.status = "CANCELLED"; r.reason = t("Kullanıcı iptal etti."); r.cancelledBy = userName(me());
    logAction("CANCELLED", r);
    notify(r.participants, "cancelled_owner", r);
    save(); closeModal(); toast(t("Rezervasyon iptal edildi.")); render();
  }
  const canOwnerCancel = (r) => ACTIVE.includes(r.status) && startTs(r) - Date.now() > db.settings.cancelHours * 3600000;
  const seriesOf = (r) => (r.seriesId ? db.reservations.filter((x) => x.seriesId === r.seriesId).sort((a, b) => a.date.localeCompare(b.date)) : [r]);

  function reasonBox(container, label, confirmLabel, onOk) {
    container.innerHTML = `
      <div class="reject-box" style="width:100%">
        <label class="label" for="mReason">${label}</label>
        <textarea class="input" id="mReason" placeholder="${t("Kullanıcıya gösterilecek açıklama")}"></textarea>
        <p class="small" id="mErr" style="color:var(--danger)" hidden>${t("Lütfen bir sebep yazın.")}</p>
        <div class="btn-row"><button class="btn btn-danger" id="mConfirm">${icon("ti-x")}${confirmLabel}</button>
          <button class="btn btn-outline" data-close>${t("Vazgeç")}</button></div>
      </div>`;
    $("#mReason", container).focus();
    $("#mConfirm", container).onclick = () => {
      const reason = $("#mReason", container).value.trim();
      if (!reason) { $("#mErr", container).hidden = false; return; }
      onOk(reason);
    };
  }

  // ---------- Takvim dosyası (.ics) ----------
  function downloadIcs(r) {
    const stamp = (d, tm) => d.replace(/-/g, "") + "T" + tm.replace(":", "") + "00";
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yasar Universitesi//SKS Rezervasyon//TR", "BEGIN:VEVENT",
      `UID:${r.id}@sks.yasar.edu.tr`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Istanbul:${stamp(r.date, r.start)}`, `DTEND;TZID=Europe/Istanbul:${stamp(r.date, r.end)}`,
      `SUMMARY:${roomName(r.roomId)}${teamName(r) ? " – " + teamName(r) : ""}`,
      `LOCATION:${room(r.roomId)?.location || "Yaşar Üniversitesi"}`,
      `DESCRIPTION:${t("Giriş kodu")}: ${r.checkinCode}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `rezervasyon-${r.date}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Rezervasyon detayı ----------
  function openDetail(id) {
    const r = db.reservations.find((x) => x.id === id);
    if (!r) return;
    const no = myNo(), staff = isStaff(), owner = r.ownerNumber === no;
    if (!staff && !involves(r, no)) return;
    const n = people(r), series = seriesOf(r);
    const att = r.attendance;
    const row = (i, pno, role) => {
      const ok = isSigned(r, pno);
      return `<tr><td class="num muted">${i}</td>
        <td><span class="mono">${esc(pno)}</span>${role ? ` <span class="badge b-accent">${role}</span>` : ""}
          <div class="small ${nameOf(pno) ? "" : "muted"}">${esc(nameOf(pno)) || t("Rehberde yok")}</div></td>
        <td>${ok ? `<span class="badge b-success">${icon("ti-check")}${t("İmzaladı")}</span>` : `<span class="badge b-warning">${icon("ti-hourglass")}${t("Bekleniyor")}</span>`}</td>
        ${att ? `<td>${att[pno] ? `<span class="badge b-success">${t("Geldi")}</span>` : `<span class="badge b-danger">${t("Gelmedi")}</span>`}</td>` : ""}</tr>`;
    };
    const canSee = staff || owner;
    const history = db.log.filter((l) => l.resId === r.id).sort((a, b) => b.at - a.at);
    const actions = [];
    if (r.status === "APPROVED") actions.push(`<button class="btn btn-outline" id="mIcs">${icon("ti-calendar-down")}${t("Takvime ekle (.ics)")}</button>`);
    if (staff && r.status === "PENDING") actions.push(`<button class="btn btn-success" id="mApprove">${icon("ti-check")}${series.length > 1 ? t("Seriyi onayla ({n})", { n: series.filter((x) => x.status === "PENDING").length }) : t("Onayla")}</button>`,
      `<button class="btn btn-danger-outline" id="mReject">${icon("ti-x")}${t("Reddet")}</button>`);
    if (staff && r.status === "PENDING" && unsigned(r).length) actions.push(`<button class="btn btn-outline" id="mRemind">${icon("ti-bell-ringing")}${t("Eksiklere hatırlat")}</button>`);
    if (staff && r.status === "APPROVED" && startTs(r) > Date.now()) actions.push(`<button class="btn btn-danger-outline" id="mStaffCancel">${icon("ti-ban")}${t("Rezervasyonu iptal et")}</button>`);
    if (staff && r.status === "APPROVED" && r.date <= addDays(0)) actions.push(`<button class="btn btn-primary" id="mAttend">${icon("ti-clipboard-check")}${t("Yoklama al")}</button>`);
    if (owner && !staff && ACTIVE.includes(r.status)) actions.push(canOwnerCancel(r)
      ? `<button class="btn btn-danger-outline" id="mCancel">${icon("ti-ban")}${t("İptal et")}</button>`
      : `<span class="small muted">${t("Başlangıca {h} saatten az kaldığı için iptal edilemez.", { h: db.settings.cancelHours })}</span>`);

    const w = openModal(`
      <div class="modal-head">
        <div><h2 id="mTitle">${esc(roomName(r.roomId))}${partLabel(r)}</h2>
          <div class="meta muted small">${when(r)} · ${t("{n} kişi", { n })}</div></div>
        <button class="btn btn-ghost" data-close aria-label="${t("Kapat")}">${icon("ti-x")}</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div><div class="label">${t("Durum")}</div>${statusBadge(r.status)}</div>
          <div><div class="label">${t("Tür")}</div>${r.teamId ? `${t("Takım")} · ${esc(teamName(r))}` : t("Bireysel")}</div>
          <div><div class="label">${t("Talep sahibi")}</div>${esc(r.ownerName)}${canSee ? ` <span class="mono muted">${esc(r.ownerNumber)}</span>` : ""}</div>
          <div><div class="label">${t("Talep tarihi")}</div>${fmtTs(r.createdAt)}</div>
          ${r.decidedBy ? `<div><div class="label">${t("Karar veren")}</div>${esc(r.decidedBy)}</div>` : ""}
          ${r.status === "APPROVED" && (involves(r, no) || staff) ? `<div><div class="label">${t("Giriş kodu")}</div><span class="code">${r.checkinCode}</span><div class="small muted">${t("Tesis girişinde görevliye gösterin")}</div></div>` : ""}
        </div>
        ${["REJECTED", "CANCELLED"].includes(r.status) && r.reason ? alertBox("danger", "ti-message-report", `${t(r.status === "REJECTED" ? "Red sebebi" : "İptal sebebi")}: ${esc(r.reason)}`) : ""}
        ${series.length > 1 ? `<div class="section-head"><h3>${t("Tekrarlayan seri")} <span class="muted">(${t("{n} hafta", { n: series.length })})</span></h3></div>
          <div class="series">${series.map((x) => `<span class="badge ${STATUS[x.status].cls} ${x.id === r.id ? "current" : ""}" title="${t(STATUS[x.status].label)}">${fmtDate(x.date)}</span>`).join("")}</div>` : ""}
        ${canSee ? `
        <div class="section-head">
          <h3>${t("Katılımcılar")} <span class="muted">(${n})</span></h3>
          <span class="small muted">${t("{a}/{b} feragatname", { a: signedCount(r), b: n })}</span>
        </div>
        <div class="table-wrap"><table class="plist">
          <thead><tr><th class="num">#</th><th>${t("Öğrenci")}</th><th>${t("Feragatname")}</th>${att ? `<th>${t("Yoklama")}</th>` : ""}</tr></thead>
          <tbody>
            ${row(1, r.ownerNumber, t("Talep sahibi"))}
            ${r.participants.map((pno, i) => row(i + 2, pno, "")).join("")}
          </tbody>
        </table></div>
        ${r.participants.length && staff ? `<button class="btn btn-ghost small" id="mCopy">${icon("ti-copy")}${t("Öğrenci numaralarını kopyala")}</button>` : ""}
        ${history.length ? `<details class="history"><summary>${icon("ti-history")}${t("İşlem geçmişi")} (${history.length})</summary>
          <ul>${history.map((l) => `<li><span class="muted small">${fmtTs(l.at)}</span> ${t(LOG_LABEL[l.action] || l.action)} · <b>${esc(l.by)}</b>${l.detail ? ` · ${esc(l.detail)}` : ""}</li>`).join("")}</ul></details>` : ""}` : ""}
      </div>
      ${actions.length ? `<div class="modal-foot" id="mActions">${actions.join("")}</div>` : ""}`);

    const on = (sel, fn) => { const b = $(sel, w); if (b) b.onclick = fn; };
    on("#mCopy", async () => {
      try { await navigator.clipboard.writeText([r.ownerNumber, ...r.participants].join("\n")); toast(t("Numaralar kopyalandı.")); } catch { toast(t("Kopyalanamadı.")); }
    });
    on("#mIcs", () => downloadIcs(r));
    on("#mApprove", () => approveList(series.filter((x) => x.status === "PENDING")));
    on("#mReject", () => reasonBox($("#mActions", w), t("Red sebebi"), t("Reddet"), (reason) => rejectList(series.filter((x) => x.status === "PENDING"), reason)));
    on("#mStaffCancel", () => reasonBox($("#mActions", w), t("İptal sebebi"), t("İptal et"), (reason) => staffCancel(r, reason)));
    on("#mCancel", () => ownerCancel(r));
    on("#mAttend", () => openAttendance(r.id));
    on("#mRemind", () => {
      notify(unsigned(r), "waiver_reminder", r);
      logAction("WAIVER_REMINDER", r, unsigned(r).join(", "));
      save(); toast(t("{n} kişiye hatırlatma gönderildi.", { n: unsigned(r).length }));
    });
  }

  // Paylaşımlı alanda bir zaman dilimindeki talepler
  function openSlot(roomId, date, from, to) {
    const list = activeOn(roomId, date).filter((x) => toMin(x.start) < to && from < toMin(x.end));
    const w = openModal(`
      <div class="modal-head">
        <div><h2 id="mTitle">${esc(roomName(roomId))}</h2><div class="meta muted small">${fmtDate(date)} · ${fromMin(from)}–${fromMin(to)}</div></div>
        <button class="btn btn-ghost" data-close aria-label="${t("Kapat")}">${icon("ti-x")}</button>
      </div>
      <div class="modal-body stack">${list.map((x) => resRow(x)).join("")}</div>`);
    bindResRows(w);
  }

  // Listelerde kullanılan tıklanabilir satır
  function resRow(r) {
    const staff = isStaff();
    return `
      <button class="row-card row-btn" data-open="${r.id}">
        <div>
          <div class="title">${staff ? `${esc(r.ownerName)} <span class="mono muted small">${esc(r.ownerNumber)}</span>` : esc(roomName(r.roomId))}</div>
          <div class="meta">
            ${staff ? `<span>${icon("ti-building")}${esc(roomName(r.roomId))}${partLabel(r)}${r.teamId ? ` · ${esc(teamName(r))}` : ""}</span>` : r.teamId ? `<span>${icon("ti-users-group")}${esc(teamName(r))}</span>` : ""}
            <span>${icon("ti-calendar")}${fmtDate(r.date)}</span>
            <span>${icon("ti-clock")}${r.start}–${r.end}</span>
            <span>${icon("ti-users")}${t("{n} kişi", { n: people(r) })}</span>
            ${r.seriesId ? `<span>${icon("ti-repeat")}${t("Seri")}</span>` : ""}
          </div>
        </div>
        <div class="side">${statusBadge(r.status)}<span class="small link">${t("Detay")} ${icon("ti-chevron-right")}</span></div>
      </button>`;
  }
  function bindResRows(root = document) { root.querySelectorAll("[data-open]").forEach((b) => b.onclick = (e) => { if (e.target.closest("input")) return; openDetail(b.dataset.open); }); }

  // ---------- Takvim ----------
  const HOUR_PX = 44;
  function calState() {
    if (!ui.cal) ui.cal = { view: matchMedia("(max-width: 720px)").matches ? "day" : "week", roomId: db.rooms[0]?.id, date: addDays(0) };
    if (!room(ui.cal.roomId)) ui.cal.roomId = db.rooms[0]?.id;
    return ui.cal;
  }

  function renderCalendar() {
    ROUTES.calendar.bind = bindCalendar;
    const c = calState();
    if (!db.rooms.length) return `<h1 class="page-head">${t("Takvim")}</h1><div class="empty">${icon("ti-building")}${t("Henüz alan tanımlı değil.")}</div>`;
    const cols = c.view === "week"
      ? Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(mondayOf(c.date), i), room: room(c.roomId) }))
      : db.rooms.map((r) => ({ date: c.date, room: r }));
    const hs = db.hours.filter((h) => cols.some((col) => col.room.id === h.roomId));
    const from = Math.floor(Math.min(8 * 60, ...hs.map((h) => toMin(h.open))) / 60) * 60;
    const to = Math.ceil(Math.max(22 * 60, ...hs.map((h) => toMin(h.close))) / 60) * 60;
    const px = (m) => ((m - from) * HOUR_PX) / 60;
    const today = addDays(0), now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const staff = isStaff(), no = myNo();

    const label = c.view === "week"
      ? (() => { const a = new Date(mondayOf(c.date) + "T00:00"), b = new Date(shiftDate(mondayOf(c.date), 6) + "T00:00");
          return `${a.toLocaleDateString(loc(), { day: "numeric", month: "short" })} – ${b.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric" })}`; })()
      : new Date(c.date + "T00:00").toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const head = cols.map((col) => {
      const isToday = col.date === today;
      return c.view === "week"
        ? `<div class="cal-colhead ${isToday ? "today" : ""}"><span>${dayName(new Date(col.date + "T00:00").getDay(), "short")}</span><strong>${new Date(col.date + "T00:00").getDate()}</strong></div>`
        : `<div class="cal-colhead"><strong class="room-name">${esc(col.room.name)}</strong><span>${t(MODES[col.room.mode])} · ${t("{n} kişi", { n: col.room.capacity })}</span></div>`;
    }).join("");

    const body = cols.map((col) => {
      const r = col.room, day = new Date(col.date + "T00:00").getDay();
      const closure = db.closures.find((x) => col.date >= x.start && col.date <= x.end);
      const slots = closure ? [] : db.hours.filter((h) => h.roomId === r.id && h.day === day).sort((a, b) => a.open.localeCompare(b.open));
      let parts = "", cur = from;
      for (const h of slots) {
        const o = toMin(h.open), cl = toMin(h.close);
        if (o > cur) parts += `<div class="cal-closed" style="top:${px(cur)}px;height:${px(o) - px(cur)}px"></div>`;
        if (h.audience !== "all") parts += `<div class="cal-aud aud-${h.audience}" style="top:${px(o)}px;height:${px(cl) - px(o)}px"><span>${t(AUDIENCE[h.audience])}</span></div>`;
        cur = Math.max(cur, cl);
      }
      if (cur < to) parts += `<div class="cal-closed" style="top:${px(cur)}px;height:${px(to) - px(cur)}px">${closure ? `<span>${icon("ti-lock")}${esc(closure.reason)}</span>` : !slots.length ? `<span>${t("Kapalı")}</span>` : ""}</div>`;
      if (col.date < today) parts += `<div class="cal-past" style="top:0;height:${px(to)}px"></div>`;
      else if (col.date === today && nowMin > from) {
        parts += `<div class="cal-past" style="top:0;height:${px(Math.min(nowMin, to))}px"></div>`;
        if (nowMin < to) parts += `<div class="cal-now" style="top:${px(nowMin)}px"></div>`;
      }
      const list = activeOn(r.id, col.date);
      if (r.mode === "exclusive") {
        parts += list.map((x) => {
          const mine = involves(x, no);
          const who = x.ownerNumber === no ? t("Sizin talebiniz") : mine ? t("Katılımcısınız") : staff ? esc(teamName(x) || x.ownerName) : x.status === "PENDING" ? t("Ön rezervasyon") : t("Dolu");
          const top = px(toMin(x.start)), h = px(toMin(x.end)) - top;
          const half = r.divisible && x.part !== "full" ? `half-${x.part.toLowerCase()}` : "";
          return `<div class="cal-ev ${x.status === "PENDING" ? "pending" : "approved"} ${mine ? "mine" : ""} ${half}" style="top:${top}px;height:${h}px"
            title="${x.start}–${x.end} · ${t(STATUS[x.status].label)}${staff || mine ? ` · ${t("{n} kişi", { n: people(x) })}` : ""}${half ? ` · ${t(PARTS[x.part])}` : ""}" data-ev="${x.id}">
            <span class="t">${x.start}–${x.end}${half ? ` · ${x.part}` : ""}</span>${h >= 34 ? `<span class="w">${who}</span>` : ""}</div>`;
        }).join("");
      } else {
        const segs = [];
        for (let m = from; m < to; m += 30) {
          const inSlot = list.filter((x) => toMin(x.start) < m + 30 && m < toMin(x.end));
          const n = inSlot.reduce((s, x) => s + people(x), 0);
          const pend = inSlot.some((x) => x.status === "PENDING");
          const last = segs[segs.length - 1];
          if (n && last && last.n === n && last.end === m && last.pend === pend) last.end = m + 30;
          else if (n) segs.push({ start: m, end: m + 30, n, pend });
        }
        parts += segs.map((sg) => {
          const full = sg.n >= r.capacity, top = px(sg.start), h = px(sg.end) - top;
          return `<div class="cal-load ${full ? "full" : ""} ${sg.pend ? "pending" : ""} ${staff ? "clickable" : ""}" data-seg="${sg.start}-${sg.end}" style="top:${top}px;height:${h}px" title="${fromMin(sg.start)}–${fromMin(sg.end)} · ${sg.n}/${r.capacity}">
            <span class="t">${full ? t("Dolu") : `${sg.n}/${r.capacity}`}</span>${h >= 34 && !full ? `<span class="w">${t("{n} yer var", { n: r.capacity - sg.n })}</span>` : ""}</div>`;
        }).join("");
      }
      return `<div class="cal-col ${col.date === today ? "today" : ""}" data-date="${col.date}" data-room="${r.id}">${parts}</div>`;
    }).join("");

    const hours = [];
    for (let m = from; m < to; m += 60) hours.push(`<span style="top:${px(m)}px">${fromMin(m)}</span>`);
    const showsAud = cols.some((col) => db.hours.some((h) => h.roomId === col.room.id && h.audience !== "all"));
    const cr = room(c.roomId);

    return `
      <h1 class="page-head">${t("Takvim")}</h1>
      <p class="page-sub">${t("Dolu ve boş saatleri görün. Boş bir saate tıklayarak o saat için talep oluşturabilirsiniz.")}</p>
      <div class="cal-toolbar">
        <div class="seg" role="group" aria-label="${t("Görünüm")}">
          <button class="${c.view === "week" ? "on" : ""}" data-view="week">${icon("ti-calendar-week")}${t("Hafta")}</button>
          <button class="${c.view === "day" ? "on" : ""}" data-view="day">${icon("ti-layout-columns")}${t("Gün · tüm alanlar")}</button>
        </div>
        ${c.view === "week" ? `<select class="input cal-room" id="calRoom" aria-label="${t("Alan")}">${db.rooms.map((r) => `<option value="${r.id}" ${r.id === c.roomId ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
          <button class="btn btn-ghost" data-room-info="${cr.id}" title="${t("Alan bilgisi ve kurallar")}">${icon("ti-info-circle")}</button>` : ""}
        <div class="cal-nav">
          <button class="btn btn-outline icon-btn" data-step="-1" aria-label="${t("Önceki")}">${icon("ti-chevron-left")}</button>
          <button class="btn btn-outline" data-step="0">${t("Bugün")}</button>
          <button class="btn btn-outline icon-btn" data-step="1" aria-label="${t("Sonraki")}">${icon("ti-chevron-right")}</button>
          <span class="cal-label">${label}</span>
        </div>
      </div>
      <div class="legend">
        <span><i class="sw sw-ok"></i>${t("Onaylı")}</span>
        <span><i class="sw sw-pend"></i>${t("Ön rezervasyon")}</span>
        ${cols.some((col) => col.room.mode === "shared") ? `<span><i class="sw sw-load"></i>${t("Paylaşımlı doluluk")}</span>` : ""}
        ${showsAud ? `<span><i class="sw sw-aud"></i>${t("Özel kullanım saati")}</span>` : ""}
        <span><i class="sw sw-closed"></i>${t("Kapalı")}</span>
        <span><i class="sw sw-free"></i>${t("Boş: tıklayın")}</span>
      </div>
      <div class="card flush"><div class="cal-scroll">
        <div class="cal" data-from="${from}" style="--cols:${cols.length};--h:${px(to)}px">
          <div class="cal-corner"></div>${head}
          <div class="cal-gutter">${hours.join("")}</div>${body}
        </div>
      </div></div>`;
  }

  function bindCalendar() {
    const c = ui.cal;
    bindRoomInfo();
    $$("[data-view]").forEach((b) => b.onclick = () => { c.view = b.dataset.view; render(); });
    $("#calRoom") && ($("#calRoom").onchange = (e) => { c.roomId = e.target.value; render(); });
    $$("[data-step]").forEach((b) => b.onclick = () => {
      const n = +b.dataset.step;
      c.date = n === 0 ? addDays(0) : shiftDate(c.date, n * (c.view === "week" ? 7 : 1));
      render();
    });
    $$(".cal-ev").forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      const x = db.reservations.find((r) => r.id === el.dataset.ev);
      if (isStaff() || involves(x, myNo())) openDetail(x.id);
      else toast(t("{t} arası dolu.", { t: `${x.start}–${x.end}` }));
    });
    $$(".cal-load.full, .cal-load.clickable").forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      const col = el.closest(".cal-col"), [a, b] = el.dataset.seg.split("-").map(Number);
      if (isStaff()) openSlot(col.dataset.room, col.dataset.date, a, b);
      else toast(t("Bu saatte kapasite dolu."));
    });
    const from = +$(".cal")?.dataset.from;
    $$(".cal-col").forEach((col) => col.onclick = (e) => {
      const r = room(col.dataset.room), date = col.dataset.date;
      const y = e.clientY - col.getBoundingClientRect().top;
      const start = from + Math.floor((y * 60) / HOUR_PX / 30) * 30;
      const day = new Date(date + "T00:00").getDay();
      const slot = db.hours.find((h) => h.roomId === r.id && h.day === day && start >= toMin(h.open) && start < toMin(h.close));
      if (db.closures.some((x) => date >= x.start && date <= x.end) || !slot) return toast(t("Bu saatte alan kapalı."));
      if (new Date(`${date}T${fromMin(start)}`).getTime() < Date.now() + db.settings.minLeadHours * 3600000)
        return toast(t("Rezervasyon en az {h} saat önceden yapılmalı.", { h: db.settings.minLeadHours }));
      let end = Math.min(start + 60, toMin(slot.close));
      if (r.mode === "exclusive" && !r.divisible) {
        const next = activeOn(r.id, date).map((x) => toMin(x.start)).filter((m) => m > start);
        if (next.length) end = Math.min(end, ...next);
      }
      ui.prefill = { roomId: r.id, date, start: fromMin(start), end: fromMin(end) };
      go("new");
    });
  }

  // ---------- 5. Rezervasyonlarım ----------
  function renderMine() {
    ROUTES.mine.bind = () => {
      bindResRows();
      $$("[data-cancel]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); ownerCancel(db.reservations.find((x) => x.id === b.dataset.cancel)); });
    };
    const no = myNo();
    const list = db.reservations.filter((r) => involves(r, no)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    const upcoming = list.filter((r) => r.date >= addDays(0) && ACTIVE.includes(r.status)).sort((a, b) => startTs(a) - startTs(b));
    const past = list.filter((r) => !upcoming.includes(r));
    const invites = myInvites();
    const card = (r) => {
      const ownerMine = r.ownerNumber === no;
      return `
        <article class="row-card clickable" data-open="${r.id}">
          <div>
            <div class="title">${esc(roomName(r.roomId))}${partLabel(r)}${r.teamId ? ` <span class="muted">· ${esc(teamName(r))}</span>` : ""}</div>
            <div class="meta">
              <span>${icon("ti-calendar")}${fmtDate(r.date)}</span>
              <span>${icon("ti-clock")}${r.start}–${r.end}</span>
              <span>${icon("ti-users")}${t("{n} kişi", { n: people(r) })}</span>
              ${!ownerMine ? `<span>${icon("ti-user-share")}${t("Davet eden: {name}", { name: esc(r.ownerName) })}</span>` : ""}
              ${r.status === "APPROVED" ? `<span>${icon("ti-key")}${t("Giriş kodu")}: <b class="mono">${r.checkinCode}</b></span>` : ""}
            </div>
            ${["REJECTED", "CANCELLED"].includes(r.status) && r.reason ? `<div class="reason">${icon("ti-message-report")}<span>${t("Sebep")}: ${esc(r.reason)}</span></div>` : ""}
          </div>
          <div class="side">
            ${statusBadge(r.status)}
            ${ownerMine && canOwnerCancel(r) ? `<button class="btn btn-ghost small" data-cancel="${r.id}">${t("İptal et")}</button>` : ""}
          </div>
        </article>`;
    };
    return `
      <div class="page-head" style="justify-content:space-between">
        <h1>${t("Rezervasyonlarım")}</h1>
        <a class="btn btn-primary" href="#new">${icon("ti-plus")}${t("Yeni")}</a>
      </div>
      <p class="page-sub">${t("Ön rezervasyonlar SKS onayından sonra kesinleşir. Rezervasyona {h} saat kalana kadar iptal edebilirsiniz.", { h: db.settings.cancelHours })}</p>
      ${invites.length ? `<a class="alert alert-warning invite-banner" href="#inbox">${icon("ti-mail-opened")}<div>${t("{n} katılımcı davetiniz var. Feragatnameyi onaylamak için tıklayın.", { n: invites.length })}</div></a>` : ""}
      ${list.length ? `
        <h2 class="section-title">${t("Yaklaşan")}</h2>
        <div class="stack">${upcoming.length ? upcoming.map(card).join("") : `<div class="empty small">${t("Yaklaşan rezervasyonunuz yok.")}</div>`}</div>
        <h2 class="section-title">${t("Geçmiş ve sonuçlanan")}</h2>
        <div class="stack">${past.map(card).join("") || `<div class="empty small">—</div>`}</div>`
      : `<div class="empty">${icon("ti-calendar-off")}${t("Henüz rezervasyonunuz yok.")}<br><a href="#new">${t("İlk rezervasyonunuzu oluşturun")}</a></div>`}`;
  }

  // ---------- 6. SKS onay kuyruğu ----------
  function pendingGroups() {
    const groups = new Map();
    for (const r of db.reservations.filter((x) => x.status === "PENDING").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))) {
      const k = r.seriesId || r.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    return [...groups.entries()];
  }
  function renderApprovals() {
    ROUTES.approvals.bind = bindApprovals;
    const groups = pendingGroups();
    const tab = ui.apprTab || "pending";
    ui.selected = new Set([...ui.selected].filter((k) => groups.some(([g]) => g === k)));
    return `
      <h1 class="page-head">${t("Rezervasyon talepleri")}</h1>
      <p class="page-sub">${tab === "pending" ? t("Tarihe göre sıralı ön rezervasyonlar. Katılımcıları görmek için karta tıklayın.") : t("Ad, öğrenci numarası, takım veya alana göre arayın. Aranan numara katılımcılar arasında da aranır.")}</p>
      <div class="tabs" role="tablist">
        <button class="tab ${tab === "pending" ? "active" : ""}" data-atab="pending" role="tab" aria-selected="${tab === "pending"}">${icon("ti-hourglass")}${t("Onay bekleyenler")} <span class="badge b-warning">${groups.length}</span></button>
        <button class="tab ${tab === "all" ? "active" : ""}" data-atab="all" role="tab" aria-selected="${tab === "all"}">${icon("ti-list-search")}${t("Tüm rezervasyonlar")}</button>
      </div>
      ${tab === "pending" ? (groups.length ? `
        <div class="bulkbar">
          <label class="check"><input type="checkbox" id="selAll" ${ui.selected.size && ui.selected.size === groups.length ? "checked" : ""}><span>${t("Tümünü seç")}</span></label>
          <button class="btn btn-success" id="bulkApprove" ${ui.selected.size ? "" : "disabled"}>${icon("ti-checks")}${t("Seçilenleri onayla ({n})", { n: ui.selected.size })}</button>
        </div>
        <div class="stack">${groups.map(([k, list]) => pendingCard(k, list)).join("")}</div>`
        : `<div class="empty">${icon("ti-circle-check")}${t("Onay bekleyen talep yok.")}</div>`) : `
      <div class="filters">
        <div class="search">${icon("ti-search")}<input class="input" id="aq" type="search" placeholder="${t("Ad, öğrenci no, takım, alan…")}" value="${esc(ui.aq || "")}" aria-label="${t("Ara")}"></div>
        <select class="input" id="as" aria-label="${t("Durum")}">
          <option value="">${t("Tüm durumlar")}</option>
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${ui.as === k ? "selected" : ""}>${t(v.label)}</option>`).join("")}
        </select>
      </div>
      <div id="allList" class="stack"></div>`}`;
  }

  function pendingCard(key, list) {
    const r = list[0], n = people(r), signedN = signedCount(r), pct = Math.round((signedN / n) * 100);
    const shown = r.participants.slice(0, 8), missing = unsigned(r).length;
    return `
      <article class="card approval ${ui.selected.has(key) ? "selected" : ""}">
        <div class="top">
          <label class="check sel"><input type="checkbox" data-sel="${key}" ${ui.selected.has(key) ? "checked" : ""} aria-label="${t("Seç")}"></label>
          <div style="flex:1">
            <h2>${esc(roomName(r.roomId))}${partLabel(r)}</h2>
            <div style="margin-top:2px">${esc(r.ownerName)} <span class="mono muted">${esc(r.ownerNumber)}</span>
              <span class="muted">${r.teamId ? ` · ${esc(teamName(r))}` : ""} · ${t("{n} kişi", { n })}</span></div>
          </div>
          <span class="badge ${r.teamId ? "b-accent" : "b-neutral"}">${icon(r.teamId ? "ti-users-group" : "ti-user")}${r.teamId ? t("Takım") : t("Bireysel")}</span>
        </div>
        <div class="meta muted small" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:10px">
          <span>${icon("ti-calendar")}${fmtDate(r.date)}</span>
          <span>${icon("ti-clock")}${r.start}–${r.end}</span>
          ${list.length > 1 ? `<span class="badge b-accent">${icon("ti-repeat")}${t("Her hafta · {n} tarih · son: {d}", { n: list.length, d: fmtDate(list[list.length - 1].date) })}</span>` : ""}
          <span class="waiver-meter">${icon("ti-file-certificate")}${t("{a}/{b} feragatname", { a: signedN, b: n })}
            <span class="meter ${pct < 100 ? "partial" : ""}" aria-hidden="true"><i style="width:${pct}%"></i></span></span>
        </div>
        ${missing ? `<p class="warn-line">${icon("ti-alert-triangle")}${t("{n} katılımcı feragatnameyi henüz onaylamadı. Onaylarsanız uyarı gösterilir.", { n: missing })}</p>` : ""}
        ${r.participants.length ? `
        <div class="pchips">
          <span class="label">${t("Katılımcılar")}</span>
          ${shown.map((no) => `<span class="pchip ${isSigned(r, no) ? "ok" : "wait"}" title="${esc(nameOf(no) || t("Rehberde yok"))}">${esc(no)}</span>`).join("")}
          ${r.participants.length > shown.length ? `<span class="muted small">+${r.participants.length - shown.length}</span>` : ""}
        </div>` : ""}
        <div class="actions btn-row">
          <button class="btn btn-success" data-approve="${key}">${icon("ti-check")}${list.length > 1 ? t("Seriyi onayla ({n})", { n: list.length }) : t("Onayla")}</button>
          <button class="btn btn-danger-outline" data-reject="${r.id}">${icon("ti-x")}${t("Reddet")}</button>
          <button class="btn btn-outline" data-open="${r.id}" style="margin-left:auto">${icon("ti-list-details")}${t("Detay ve katılımcılar")}</button>
        </div>
      </article>`;
  }

  function bindApprovals() {
    const groups = new Map(pendingGroups());
    $$("[data-atab]").forEach((b) => b.onclick = () => { ui.apprTab = b.dataset.atab; render(); });
    $$("[data-approve]").forEach((b) => b.onclick = () => approveList(groups.get(b.dataset.approve)));
    $$("[data-reject]").forEach((b) => b.onclick = () => { openDetail(b.dataset.reject); $("#mReject")?.click(); });
    $$("[data-sel]").forEach((c) => c.onchange = () => { c.checked ? ui.selected.add(c.dataset.sel) : ui.selected.delete(c.dataset.sel); render(); });
    $("#selAll") && ($("#selAll").onchange = (e) => { ui.selected = e.target.checked ? new Set(groups.keys()) : new Set(); render(); });
    $("#bulkApprove") && ($("#bulkApprove").onclick = () => {
      const list = [...ui.selected].flatMap((k) => groups.get(k) || []);
      const missing = list.reduce((n, r) => n + unsigned(r).length, 0);
      if (missing && !confirm(t("{n} katılımcının feragatnamesi eksik. Yine de onaylansın mı?", { n: missing }))) return;
      for (const [k, l] of groups) if (ui.selected.has(k)) {
        for (const r of l) { r.status = "APPROVED"; r.decidedBy = userName(me()); r.decidedAt = Date.now(); logAction("APPROVED", r, t("Toplu onay")); }
        notify([l[0].ownerNumber, ...l[0].participants], "approved", l[0]);
      }
      save(); toast(t("{n} rezervasyon onaylandı.", { n: list.length })); ui.selected = new Set(); render();
    });
    bindResRows();
    if ($("#allList")) {
      const draw = () => {
        const q = (ui.aq || "").toLocaleLowerCase("tr").trim();
        const list = db.reservations
          .filter((r) => !ui.as || r.status === ui.as)
          .filter((r) => !q || [r.ownerName, r.ownerNumber, teamName(r), roomName(r.roomId), r.checkinCode, ...r.participants, ...r.participants.map(nameOf)]
            .some((v) => String(v || "").toLocaleLowerCase("tr").includes(q)))
          .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
        $("#allList").innerHTML = `<p class="small muted">${t("{n} rezervasyon", { n: list.length })}</p>` +
          (list.length ? list.slice(0, 100).map(resRow).join("") : `<div class="empty">${icon("ti-search")}${t("Sonuç bulunamadı.")}</div>`);
        bindResRows($("#allList"));
      };
      $("#aq").oninput = (e) => { ui.aq = e.target.value; draw(); };
      $("#as").onchange = (e) => { ui.as = e.target.value; draw(); };
      draw();
    }
  }

  // ---------- 7. Yoklama ----------
  function renderCheckin() {
    ROUTES.checkin.bind = () => {
      bindResRows();
      $$("[data-attend]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openAttendance(b.dataset.attend); });
      $$("[data-cstep]").forEach((b) => b.onclick = () => { const n = +b.dataset.cstep; ui.checkDate = n === 0 ? addDays(0) : shiftDate(ui.checkDate, n); render(); });
      $("#codeForm").onsubmit = (e) => {
        e.preventDefault();
        const code = $("#codeIn").value.trim().toUpperCase();
        const r = db.reservations.find((x) => x.checkinCode === code);
        if (!r) return toast(t("Bu kodla bir rezervasyon bulunamadı."));
        if (r.status !== "APPROVED") return toast(t("Bu rezervasyonun durumu: {s}", { s: t(STATUS[r.status].label) }));
        openAttendance(r.id);
      };
    };
    if (!ui.checkDate) ui.checkDate = addDays(0);
    const d = ui.checkDate;
    const dayList = db.reservations.filter((r) => r.date === d && ["APPROVED", "COMPLETED", "NO_SHOW"].includes(r.status)).sort((a, b) => a.start.localeCompare(b.start));
    const overdue = db.reservations.filter((r) => r.status === "APPROVED" && r.date < addDays(0)).sort((a, b) => a.date.localeCompare(b.date));
    const card = (r) => `
      <article class="row-card clickable" data-open="${r.id}">
        <div>
          <div class="title">${esc(roomName(r.roomId))}${partLabel(r)} <span class="muted">· ${r.start}–${r.end}</span></div>
          <div class="meta"><span>${icon("ti-user")}${esc(r.ownerName)}</span>${r.teamId ? `<span>${icon("ti-users-group")}${esc(teamName(r))}</span>` : ""}
            <span>${icon("ti-users")}${t("{n} kişi", { n: people(r) })}</span><span>${icon("ti-key")}<b class="mono">${r.checkinCode}</b></span>
            ${r.attendance ? `<span>${icon("ti-user-check")}${t("{a}/{b} geldi", { a: Object.values(r.attendance).filter(Boolean).length, b: people(r) })}</span>` : ""}</div>
        </div>
        <div class="side">${statusBadge(r.status)}${r.status === "APPROVED" && r.date <= addDays(0) ? `<button class="btn btn-primary small" data-attend="${r.id}">${icon("ti-clipboard-check")}${t("Yoklama al")}</button>` : ""}</div>
      </article>`;
    return `
      <h1 class="page-head">${t("Yoklama")}</h1>
      <p class="page-sub">${t("Tesis girişinde katılımcıları işaretleyin. Gelmeyenler kaydedilir ve gelmeme kuralı uygulanır.")}</p>
      <form class="card code-card" id="codeForm">
        <label for="codeIn" class="label">${t("Giriş kodu ile bul")}</label>
        <div class="code-row"><input class="input mono" id="codeIn" maxlength="6" placeholder="K7P2QX" autocomplete="off" autocapitalize="characters">
          <button class="btn btn-primary" type="submit">${icon("ti-search")}${t("Bul")}</button></div>
        <p class="hint">${t("Kullanıcı, onaylı rezervasyonunda görünen 6 haneli kodu gösterir.")}</p>
      </form>
      ${overdue.length ? `<h2 class="section-title">${icon("ti-alert-triangle")} ${t("Yoklaması alınmamış geçmiş rezervasyonlar")} <span class="badge b-warning">${overdue.length}</span></h2>
        <div class="stack">${overdue.map(card).join("")}</div>` : ""}
      <div class="section-title day-nav">
        <h2>${fmtDay(d)}</h2>
        <div class="cal-nav">
          <button class="btn btn-outline icon-btn" data-cstep="-1" aria-label="${t("Önceki")}">${icon("ti-chevron-left")}</button>
          <button class="btn btn-outline" data-cstep="0">${t("Bugün")}</button>
          <button class="btn btn-outline icon-btn" data-cstep="1" aria-label="${t("Sonraki")}">${icon("ti-chevron-right")}</button>
        </div>
      </div>
      <div class="stack">${dayList.length ? dayList.map(card).join("") : `<div class="empty">${icon("ti-calendar-off")}${t("Bu gün için onaylı rezervasyon yok.")}</div>`}</div>`;
  }

  function openAttendance(id) {
    const r = db.reservations.find((x) => x.id === id);
    const everyone = [r.ownerNumber, ...r.participants];
    const w = openModal(`
      <div class="modal-head">
        <div><h2 id="mTitle">${t("Yoklama")} · ${esc(roomName(r.roomId))}</h2><div class="meta muted small">${when(r)} · ${t("Giriş kodu")}: <b class="mono">${r.checkinCode}</b></div></div>
        <button class="btn btn-ghost" data-close aria-label="${t("Kapat")}">${icon("ti-x")}</button>
      </div>
      <div class="modal-body">
        <div class="btn-row" style="margin-bottom:10px"><button class="btn btn-outline small" id="allIn">${icon("ti-checks")}${t("Hepsi geldi")}</button>
          <button class="btn btn-outline small" id="allOut">${t("Temizle")}</button></div>
        <div class="att-list">${everyone.map((no, i) => `
          <label class="att"><input type="checkbox" data-no="${esc(no)}" ${r.attendance?.[no] ? "checked" : ""}>
            <span><b>${esc(nameOf(no) || no)}</b> <span class="mono muted small">${esc(no)}</span>${i === 0 ? ` <span class="badge b-accent">${t("Talep sahibi")}</span>` : ""}
            ${!isSigned(r, no) ? ` <span class="badge b-warning">${t("Feragatname yok")}</span>` : ""}</span>
            <span class="att-state"></span></label>`).join("")}</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" id="attSave">${icon("ti-device-floppy")}${t("Yoklamayı kaydet")}</button>
        <span class="small muted" id="attSum"></span></div>`);
    const boxes = $$("input[data-no]", w);
    const sum = () => { $("#attSum", w).textContent = t("{a}/{b} geldi", { a: boxes.filter((b) => b.checked).length, b: boxes.length }); };
    boxes.forEach((b) => b.onchange = sum); sum();
    $("#allIn", w).onclick = () => { boxes.forEach((b) => { b.checked = true; }); sum(); };
    $("#allOut", w).onclick = () => { boxes.forEach((b) => { b.checked = false; }); sum(); };
    $("#attSave", w).onclick = () => {
      const a = {}; boxes.forEach((b) => { a[b.dataset.no] = b.checked; });
      const came = Object.values(a).filter(Boolean).length;
      r.attendance = a; r.status = came ? "COMPLETED" : "NO_SHOW";
      logAction("ATTENDANCE", r, t("{a}/{b} geldi", { a: came, b: boxes.length }));
      notify(Object.keys(a).filter((no) => !a[no]), "noshow", r);
      save(); closeModal(); toast(t("Yoklama kaydedildi: {a}/{b} geldi.", { a: came, b: boxes.length })); render();
    };
  }

  // ---------- 8. Raporlar ----------
  function statRange() {
    const today = addDays(0);
    if (ui.statRange === "custom" && ui.statFrom && ui.statTo) return [ui.statFrom, ui.statTo];
    if (ui.statRange === "7") return [addDays(-7), today];
    if (ui.statRange === "term") {
      const end = db.settings.semesterEnd, y = +end.slice(0, 4);
      const start = end.slice(5, 7) === "01" ? `${y - 1}-09-15` : `${y}-02-09`;
      return [start, end < today ? end : today];
    }
    return [addDays(-30), today];
  }
  function renderStats() {
    ROUTES.stats.bind = bindStats;
    const [from, to] = statRange();
    const inRange = db.reservations.filter((r) => r.date >= from && r.date <= to);
    const counted = inRange.filter((r) => !["REJECTED", "CANCELLED"].includes(r.status));
    const final = inRange.filter((r) => ["COMPLETED", "NO_SHOW"].includes(r.status) && r.attendance);
    const expected = final.reduce((s, r) => s + Object.keys(r.attendance).length, 0);
    const came = final.reduce((s, r) => s + Object.values(r.attendance).filter(Boolean).length, 0);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    const cancelled = inRange.filter((r) => r.status === "CANCELLED").length;

    const rows = db.rooms.map((rm) => {
      const rs = counted.filter((r) => r.roomId === rm.id), fs = final.filter((r) => r.roomId === rm.id);
      const e = fs.reduce((s, r) => s + Object.keys(r.attendance).length, 0), a = fs.reduce((s, r) => s + Object.values(r.attendance).filter(Boolean).length, 0);
      const hoursUsed = rs.reduce((s, r) => s + (toMin(r.end) - toMin(r.start)) / 60, 0);
      return { name: rm.name, count: rs.length, people: rs.reduce((s, r) => s + people(r), 0), hours: hoursUsed, rate: pct(a, e), noshow: e ? 100 - pct(a, e) : null };
    });

    // Gün × saat yoğunluğu: o saat diliminde süren rezervasyon sayısı
    const hoursAxis = Array.from({ length: 14 }, (_, i) => 8 + i);
    const grid = DAY_ORDER.map((d) => hoursAxis.map((h) => counted.filter((r) => new Date(r.date + "T00:00").getDay() === d && toMin(r.start) < (h + 1) * 60 && toMin(r.end) > h * 60).length));
    const max = Math.max(1, ...grid.flat());
    const shade = (v) => (v ? `rgba(0, 68, 143, ${(0.12 + 0.88 * (v / max)).toFixed(2)})` : "var(--surface-2)");

    // Fakülte dağılımı (kişi bazında)
    const fac = {};
    for (const r of counted) for (const no of [r.ownerNumber, ...r.participants]) { const f = dir(no)?.faculty || t("Bilinmiyor"); fac[f] = (fac[f] || 0) + 1; }
    const facRows = Object.entries(fac).sort((a, b) => b[1] - a[1]);
    const facMax = Math.max(1, ...facRows.map((x) => x[1]));

    const tile = (ic, label, value, sub = "") => `<div class="card metric"><div class="label">${icon(ic)}${label}</div><div class="value">${value}</div>${sub ? `<div class="small muted">${sub}</div>` : ""}</div>`;
    return `
      <div class="page-head" style="justify-content:space-between;flex-wrap:wrap">
        <h1>${t("Raporlar")}</h1>
        <button class="btn btn-outline" id="csvBtn">${icon("ti-file-spreadsheet")}${t("Excel'e aktar (CSV)")}</button>
      </div>
      <p class="page-sub">${t("{from} – {to} arası. Reddedilen ve iptal edilen talepler kullanım sayılarına dahil edilmez.", { from: fmtDay(from), to: fmtDay(to) })}</p>
      <div class="filters range">
        <div class="seg" role="group" aria-label="${t("Tarih aralığı")}">
          ${[["7", "Son 7 gün"], ["30", "Son 30 gün"], ["term", "Bu dönem"], ["custom", "Özel"]].map(([k, l]) => `<button class="${ui.statRange === k ? "on" : ""}" data-range="${k}">${t(l)}</button>`).join("")}
        </div>
        ${ui.statRange === "custom" ? `<div class="grid-2"><input class="input" type="date" id="sFrom" value="${from}" aria-label="${t("Başlangıç")}"><input class="input" type="date" id="sTo" value="${to}" aria-label="${t("Bitiş")}"></div>` : ""}
      </div>
      <div class="metrics four">
        ${tile("ti-calendar-stats", t("Rezervasyon"), counted.length, t("{n} iptal", { n: cancelled }))}
        ${tile("ti-users", t("Toplam kişi"), counted.reduce((s, r) => s + people(r), 0))}
        ${tile("ti-user-check", t("Katılım oranı"), pct(came, expected) == null ? "—" : `%${pct(came, expected)}`, t("{a}/{b} kişi geldi", { a: came, b: expected }))}
        ${tile("ti-user-x", t("Gelmeme oranı"), pct(came, expected) == null ? "—" : `%${100 - pct(came, expected)}`, t("{n} rezervasyona hiç gelinmedi", { n: final.filter((r) => r.status === "NO_SHOW").length }))}
      </div>
      <div class="card flush">
        <div class="card-head"><h2>${t("Alan kullanımı")}</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t("Alan")}</th><th class="num">${t("Rezervasyon")}</th><th class="num">${t("Kişi")}</th><th class="num">${t("Saat")}</th><th class="num">${t("Katılım")}</th><th class="num">${t("Gelmeme")}</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr><td>${esc(r.name)}</td><td class="num">${r.count}</td><td class="num">${r.people}</td><td class="num">${r.hours.toLocaleString(loc())}</td>
              <td class="num">${r.rate == null ? `<span class="muted">—</span>` : `<span class="rate"><span class="meter" aria-hidden="true"><i style="width:${r.rate}%"></i></span>%${r.rate}</span>`}</td>
              <td class="num">${r.noshow == null ? `<span class="muted">—</span>` : `%${r.noshow}`}</td></tr>`).join("")}
          </tbody>
        </table></div>
      </div>
      <div class="report-grid">
        <div class="card">
          <h2>${t("Yoğun saatler")}</h2>
          <p class="small muted" style="margin-bottom:10px">${t("Her hücre, o gün ve saatte süren rezervasyon sayısını gösterir. Koyu = yoğun.")}</p>
          <div class="heat-wrap"><table class="heat" aria-label="${t("Yoğun saatler")}">
            <thead><tr><th></th>${hoursAxis.map((h) => `<th>${pad(h)}</th>`).join("")}</tr></thead>
            <tbody>${DAY_ORDER.map((d, i) => `<tr><th>${dayName(d, "short")}</th>${grid[i].map((v, j) => `<td style="background:${shade(v)}" data-tip="${esc(`${cap1(dayName(d))} ${pad(hoursAxis[j])}:00–${pad(hoursAxis[j] + 1)}:00 · ${t("{n} rezervasyon", { n: v })}`)}" tabindex="0"><span class="sr">${v}</span></td>`).join("")}</tr>`).join("")}</tbody>
          </table></div>
          <div class="heat-scale small muted"><span>0</span><i></i><span>${max}</span></div>
        </div>
        <div class="card">
          <h2>${t("Fakülteye göre kullanım")}</h2>
          <p class="small muted" style="margin-bottom:10px">${t("Rezervasyonlardaki kişi sayısı (talep sahibi ve katılımcılar).")}</p>
          <div class="bars">${facRows.map(([f, v]) => `<div class="bar-row" data-tip="${esc(`${f}: ${v}`)}"><span class="bar-label">${esc(t(f))}</span><span class="bar"><i style="width:${(v / facMax) * 100}%"></i></span><span class="bar-val">${v}</span></div>`).join("") || `<p class="muted">—</p>`}</div>
        </div>
      </div>
      <div class="tip" id="tip" hidden></div>`;
  }
  function bindStats() {
    $$("[data-range]").forEach((b) => b.onclick = () => { ui.statRange = b.dataset.range; if (b.dataset.range === "custom" && !ui.statFrom) { ui.statFrom = addDays(-30); ui.statTo = addDays(0); } render(); });
    $("#sFrom") && ($("#sFrom").onchange = (e) => { ui.statFrom = e.target.value; render(); });
    $("#sTo") && ($("#sTo").onchange = (e) => { ui.statTo = e.target.value; render(); });
    const tip = $("#tip");
    const show = (el) => { tip.textContent = el.dataset.tip; tip.hidden = false; const b = el.getBoundingClientRect(); tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, b.left + b.width / 2 - tip.offsetWidth / 2))}px`; tip.style.top = `${b.top - tip.offsetHeight - 6}px`; };
    $$("[data-tip]").forEach((el) => { el.onmouseenter = () => show(el); el.onfocus = () => show(el); el.onmouseleave = () => { tip.hidden = true; }; el.onblur = () => { tip.hidden = true; }; });
    $("#csvBtn").onclick = () => {
      const [from, to] = statRange();
      const head = ["Tarih", "Başlangıç", "Bitiş", "Alan", "Bölüm", "Durum", "Talep sahibi", "Öğrenci no", "Takım", "Kişi", "Feragatname", "Gelen", "Seri", "Giriş kodu", "Karar veren", "Sebep"];
      const rows = db.reservations.filter((r) => r.date >= from && r.date <= to).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map((r) => [
        r.date, r.start, r.end, roomName(r.roomId), r.part, t(STATUS[r.status].label), r.ownerName, r.ownerNumber, teamName(r), people(r), signedCount(r),
        r.attendance ? Object.values(r.attendance).filter(Boolean).length : "", r.seriesId ? "evet" : "", r.checkinCode, r.decidedBy || "", r.reason || ""]);
      const csv = "﻿" + [head, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `sks-rezervasyon-${from}_${to}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }

  // ---------- 9. Yönetim ----------
  function renderAdmin() {
    ROUTES.admin.bind = bindAdmin;
    const tabs = [["rooms", "Alanlar", "ti-building"], ["hours", "Açık saatler", "ti-clock"], ["closures", "Kapalı günler", "ti-calendar-off"],
      ["teams", "Takımlar", "ti-users-group"], ["users", "Kullanıcılar ve roller", "ti-user-cog"], ["rules", "Kurallar", "ti-adjustments"],
      ["waiverdoc", "Feragatname", "ti-file-certificate"], ["log", "İşlem kaydı", "ti-history"]];
    const body = { rooms: adminRooms, hours: adminHours, closures: adminClosures, teams: adminTeams, users: adminUsers, rules: adminRules, waiverdoc: adminWaiver, log: adminLog }[ui.adminTab]();
    return `
      <h1 class="page-head">${t("Yönetim")}</h1>
      <p class="page-sub">${t("Alanları, saatleri, takımları, rolleri ve kuralları düzenleyin.")}</p>
      <div class="tabs" role="tablist">
        ${tabs.map(([k, l, i]) => `<button class="tab ${ui.adminTab === k ? "active" : ""}" role="tab" aria-selected="${ui.adminTab === k}" data-tab="${k}">${icon(i)}${t(l)}</button>`).join("")}
      </div>
      ${body}`;
  }

  function adminRooms() {
    const e = db.rooms.find((r) => r.id === ui.editRoom);
    return `
      <div class="admin-grid">
        <form class="card" id="roomForm" novalidate>
          <h2 style="margin-bottom:14px">${e ? t("Alanı düzenle") : t("Alan ekle")}</h2>
          <div id="roomErr"></div>
          <div class="field"><label for="rName">${t("Ad")}</label><input class="input" id="rName" value="${esc(e?.name || "")}"></div>
          <div class="grid-2 form-row">
            <div class="field"><label for="rType">${t("Tip")}</label><select class="input" id="rType">
              ${ROOM_TYPES.map((x) => `<option value="${x}" ${e?.type === x ? "selected" : ""}>${t(x)}</option>`).join("")}</select></div>
            <div class="field"><label for="rCap">${t("Kapasite")}</label><input class="input" id="rCap" type="number" min="1" value="${e?.capacity || ""}"></div>
          </div>
          <div class="field"><label for="rMode">${t("Mod")}</label><select class="input" id="rMode">
            ${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${e?.mode === k ? "selected" : ""}>${cap1(t(v))}</option>`).join("")}</select></div>
          <label class="check form-row"><input type="checkbox" id="rDiv" ${e?.divisible ? "checked" : ""}><span>${t("İkiye bölünebilir (yarım salon kiralanabilir)")}</span></label>
          <label class="check form-row"><input type="checkbox" id="rAuto" ${e?.autoApprove ? "checked" : ""}><span>${t("Bireysel talepler otomatik onaylansın")}</span></label>
          <div class="field"><label for="rLoc">${t("Konum")}</label><input class="input" id="rLoc" value="${esc(e?.location || "")}"></div>
          <div class="field"><label for="rEq">${t("Ekipman")}</label><textarea class="input" id="rEq">${esc(e?.equipment || "")}</textarea></div>
          <div class="field"><label for="rRules">${t("Kurallar")}</label><textarea class="input" id="rRules">${esc(e?.rules || "")}</textarea></div>
          <div class="form-actions">
            ${e ? `<button type="button" class="btn btn-outline" id="rCancel">${t("Vazgeç")}</button>` : ""}
            <button class="btn btn-primary" type="submit">${e ? t("Kaydet") : `${icon("ti-plus")}${t("Ekle")}`}</button>
          </div>
        </form>
        <div class="card flush">
          <div class="card-head"><h2>${t("Mevcut alanlar")}</h2><span class="badge b-neutral">${db.rooms.length}</span></div>
          <div class="list">${db.rooms.map((r) => `
            <div class="list-item">
              <div><div>${esc(r.name)}</div><div class="meta">${esc(t(r.type))} · ${t(MODES[r.mode])} · ${t("{n} kişi", { n: r.capacity })}${r.divisible ? ` · ${t("bölünebilir")}` : ""}${r.autoApprove ? ` · ${t("otomatik onay")}` : ""}</div>
                ${r.location ? `<div class="meta">${icon("ti-map-pin")}${esc(r.location)}</div>` : ""}</div>
              <div class="btn-row">
                <button class="btn btn-ghost" data-edit-room="${r.id}" title="${t("Düzenle")}">${icon("ti-pencil")}</button>
                <button class="btn btn-ghost" data-del-room="${r.id}" title="${t("Sil")}">${icon("ti-trash")}</button>
              </div>
            </div>`).join("") || `<div class="list-item muted">${t("Henüz alan yok.")}</div>`}</div>
        </div>
      </div>`;
  }

  function adminHours() {
    const roomOpts = db.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
    const byRoom = db.rooms.map((rm) => {
      const hs = db.hours.filter((h) => h.roomId === rm.id).sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.open.localeCompare(b.open));
      return `<div class="card-head" style="background:var(--surface-2)"><span style="font-weight:500">${esc(rm.name)}</span></div>
        ${hs.map((h) => `<div class="list-item"><div>${cap1(dayName(h.day))} <span class="muted">· ${h.open}–${h.close}</span>${h.audience !== "all" ? ` <span class="badge b-accent">${t(AUDIENCE[h.audience])}</span>` : ""}</div>
          <button class="btn btn-ghost" data-del-hour="${h.id}" title="${t("Sil")}">${icon("ti-trash")}</button></div>`).join("") || `<div class="list-item muted">${t("Açık saat tanımlı değil.")}</div>`}`;
    }).join("");
    return `
      <div class="admin-grid">
        <form class="card" id="hourForm" novalidate>
          <h2 style="margin-bottom:14px">${t("Saat ekle")}</h2>
          <div id="hourErr"></div>
          <div class="field"><label for="hRoom">${t("Alan")}</label><select class="input" id="hRoom">${roomOpts}</select></div>
          <div class="field"><label for="hDay">${t("Gün")}</label><select class="input" id="hDay">
            ${DAY_ORDER.map((d) => `<option value="${d}">${cap1(dayName(d))}</option>`).join("")}</select></div>
          <div class="grid-2 form-row">
            <div class="field"><label for="hOpen">${t("Açılış")}</label><input class="input" type="time" id="hOpen" value="08:00"></div>
            <div class="field"><label for="hClose">${t("Kapanış")}</label><input class="input" type="time" id="hClose" value="22:00"></div>
          </div>
          <div class="field"><label for="hAud">${t("Kimler kullanabilir")}</label><select class="input" id="hAud">
            ${Object.entries(AUDIENCE).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("ti-plus")}${t("Ekle")}</button></div>
        </form>
        <div class="card flush"><div class="list">${byRoom}</div></div>
      </div>`;
  }

  function adminClosures() {
    const list = [...db.closures].sort((a, b) => a.start.localeCompare(b.start));
    return `
      <div class="admin-grid">
        <form class="card" id="closeForm" novalidate>
          <h2 style="margin-bottom:14px">${t("Kapalı gün ekle")}</h2>
          <div id="closeErr"></div>
          <div class="grid-2 form-row">
            <div class="field"><label for="cStart">${t("Başlangıç")}</label><input class="input" type="date" id="cStart"></div>
            <div class="field"><label for="cEnd">${t("Bitiş")}</label><input class="input" type="date" id="cEnd"></div>
          </div>
          <div class="field"><label for="cReason">${t("Sebep")}</label><input class="input" id="cReason" placeholder="${t("ör. Resmi tatil")}"></div>
          <p class="hint">${icon("ti-info-circle")}${t("Bu tarihlerdeki aktif rezervasyonlar listelenir; iptal edip kullanıcılara bildirebilirsiniz.")}</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("ti-plus")}${t("Ekle")}</button></div>
        </form>
        <div class="card flush">
          <div class="card-head"><h2>${t("Kapalı günler")}</h2><span class="badge b-neutral">${list.length}</span></div>
          <div class="list">${list.map((c) => {
            const hit = db.reservations.filter((r) => ACTIVE.includes(r.status) && r.date >= c.start && r.date <= c.end).length;
            return `<div class="list-item">
              <div><div>${fmtDate(c.start)}${c.end !== c.start ? ` – ${fmtDate(c.end)}` : ""}</div><div class="meta">${esc(c.reason)}</div>
                ${hit ? `<button class="linkbtn warn" data-affected="${c.id}">${icon("ti-alert-triangle")}${t("{n} aktif rezervasyon etkileniyor", { n: hit })}</button>` : ""}</div>
              <button class="btn btn-ghost" data-del-close="${c.id}" title="${t("Sil")}">${icon("ti-trash")}</button>
            </div>`;
          }).join("") || `<div class="list-item muted">${t("Kapalı gün tanımlı değil.")}</div>`}</div>
        </div>
      </div>`;
  }
  function openAffected(c) {
    const list = db.reservations.filter((r) => ACTIVE.includes(r.status) && r.date >= c.start && r.date <= c.end);
    if (!list.length) return;
    const w = openModal(`
      <div class="modal-head"><div><h2 id="mTitle">${t("Etkilenen rezervasyonlar")}</h2><div class="meta muted small">${esc(c.reason)} · ${fmtDate(c.start)}${c.end !== c.start ? ` – ${fmtDate(c.end)}` : ""}</div></div>
        <button class="btn btn-ghost" data-close aria-label="${t("Kapat")}">${icon("ti-x")}</button></div>
      <div class="modal-body stack">${list.map(resRow).join("")}</div>
      <div class="modal-foot"><button class="btn btn-danger" id="cancelAll">${icon("ti-ban")}${t("Hepsini iptal et ve bildir ({n})", { n: list.length })}</button>
        <button class="btn btn-outline" data-close>${t("Şimdilik bırak")}</button></div>`);
    bindResRows(w);
    $("#cancelAll", w).onclick = () => {
      for (const r of list) {
        r.status = "CANCELLED"; r.reason = c.reason; r.cancelledBy = userName(me());
        logAction("CLOSURE_CANCELLED", r, c.reason);
        notify([r.ownerNumber, ...r.participants], "closure", r);
      }
      save(); closeModal(); toast(t("{n} rezervasyon iptal edildi ve bildirildi.", { n: list.length })); render();
    };
  }

  function adminTeams() {
    const e = team(ui.editTeam);
    const person = (no) => (no ? `${esc(nameOf(no) || "?")} <span class="mono muted small">${esc(no)}</span>` : "—");
    return `
      <div class="admin-grid">
        <form class="card" id="teamForm" novalidate>
          <h2 style="margin-bottom:14px">${e ? t("Takımı düzenle") : t("Takım ekle")}</h2>
          <div id="teamErr"></div>
          <div class="field"><label for="tName">${t("Takım adı")}</label><input class="input" id="tName" value="${esc(e?.name || "")}"></div>
          <div class="grid-2 form-row">
            <div class="field"><label for="tCap">${t("Kaptan (öğrenci no)")}</label><input class="input mono" id="tCap" value="${esc(e?.captain || "")}"></div>
            <div class="field"><label for="tCoach">${t("Antrenör (personel no)")}</label><input class="input mono" id="tCoach" value="${esc(e?.coach || "")}" placeholder="P-0000"></div>
          </div>
          <div class="field"><label for="tMembers">${t("Üyeler (her satıra bir numara)")}</label><textarea class="input mono" id="tMembers" rows="6">${esc((e?.members || []).join("\n"))}</textarea></div>
          <p class="hint">${icon("ti-info-circle")}${t("Takım adına yalnızca kaptan ve antrenör talep açabilir. Talep açılırken üyeler katılımcı olarak eklenir.")}</p>
          <div class="form-actions">
            ${e ? `<button type="button" class="btn btn-outline" id="tCancel">${t("Vazgeç")}</button>` : ""}
            <button class="btn btn-primary" type="submit">${e ? t("Kaydet") : `${icon("ti-plus")}${t("Ekle")}`}</button>
          </div>
        </form>
        <div class="card flush">
          <div class="card-head"><h2>${t("Takımlar")}</h2><span class="badge b-neutral">${db.teams.length}</span></div>
          <div class="list">${db.teams.map((x) => `
            <div class="list-item">
              <div><div>${esc(x.name)} <span class="muted small">· ${t("{n} üye", { n: x.members.length })}</span></div>
                <div class="meta">${t("Kaptan")}: ${person(x.captain)}${x.coach ? ` · ${t("Antrenör")}: ${person(x.coach)}` : ""}</div></div>
              <div class="btn-row">
                <button class="btn btn-ghost" data-edit-team="${x.id}" title="${t("Düzenle")}">${icon("ti-pencil")}</button>
                <button class="btn btn-ghost" data-del-team="${x.id}" title="${t("Sil")}">${icon("ti-trash")}</button>
              </div>
            </div>`).join("") || `<div class="list-item muted">${t("Henüz takım yok.")}</div>`}</div>
        </div>
      </div>`;
  }

  function adminUsers() {
    const users = Object.values(db.users);
    return `
      <div class="admin-grid">
        <form class="card" id="userForm" novalidate>
          <h2 style="margin-bottom:14px">${t("Kullanıcıya rol ver")}</h2>
          <div id="userErr"></div>
          <div class="field"><label for="uNo">${t("Öğrenci / personel no")}</label><input class="input mono" id="uNo" placeholder="P-3150"></div>
          <div class="field"><label for="uRole">${t("Rol")}</label><select class="input" id="uRole">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select></div>
          <p class="hint">${icon("ti-info-circle")}${t("Gerçek sistemde kişiler üniversite hesabıyla girer; burada yalnızca rolleri atanır.")}</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("ti-user-plus")}${t("Kaydet")}</button></div>
        </form>
        <div class="card flush">
          <div class="card-head"><h2>${t("Kullanıcılar")}</h2><span class="badge b-neutral">${users.length}</span></div>
          <div class="list">${users.map((u) => `
            <div class="list-item">
              <div><div>${esc(userName(u))} <span class="mono muted small">${esc(u.number)}</span></div>
                <div class="meta">${t("Kullanıcı adı")}: <code>${esc(u.username)}</code> · ${t("Feragatname")}: ${waiverValid(u) ? t("geçerli") : t("yok / süresi dolmuş")}</div></div>
              <select class="input role-sel" data-role="${esc(u.username)}" ${u.username === session ? "disabled" : ""} aria-label="${t("Rol")}">
                ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${t(v)}</option>`).join("")}</select>
            </div>`).join("")}</div>
        </div>
      </div>`;
  }

  function adminRules() {
    const s = db.settings;
    const num = (id, label, v, hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" type="number" min="0" id="${id}" value="${v}">${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
    return `
      <form class="card" id="rulesForm" novalidate style="max-width:720px">
        <h2 style="margin-bottom:14px">${t("Rezervasyon kuralları")}</h2>
        <div id="rulesMsg"></div>
        <div class="grid-2">
          ${num("sLead", t("En az kaç saat önceden"), s.minLeadHours)}
          ${num("sAhead", t("En çok kaç gün sonrası için"), s.maxDaysAhead)}
          ${num("sCancel", t("İptal için son saat (başlangıçtan önce)"), s.cancelHours)}
          ${num("sDur", t("En uzun süre (dakika)"), s.maxDurationMin)}
          ${num("sQuota", t("Haftalık bireysel talep sınırı"), s.weeklyQuota)}
          ${num("sNoShow", t("Yaptırım için gelmeme sayısı"), s.noShowLimit)}
          ${num("sWindow", t("Gelmeme sayım süresi (gün)"), s.noShowWindowDays)}
          ${num("sBan", t("Yaptırım süresi (gün)"), s.banDays)}
        </div>
        <div class="field" style="margin-top:16px"><label for="sSem">${t("Dönem sonu (tekrarlayan rezervasyonlar için)")}</label><input class="input" type="date" id="sSem" value="${s.semesterEnd}"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("ti-device-floppy")}${t("Kaydet")}</button></div>
      </form>`;
  }

  function adminWaiver() {
    const d = db.waiverDoc;
    const signedN = Object.values(db.users).filter(waiverValid).length;
    return `
      <form class="card" id="waiverForm" novalidate style="max-width:820px">
        <div class="page-head" style="justify-content:space-between;flex-wrap:wrap"><h2>${t("Feragatname ve KVKK metni")}</h2>
          <span class="badge b-neutral">${t("Sürüm {v}", { v: d.version })} · ${t("{n} kullanıcı imzalı", { n: signedN })}</span></div>
        <p class="small muted" style="margin-bottom:14px">${t("Yeni sürüm yayınlandığında tüm kullanıcılar bir sonraki girişte metni yeniden onaylar. Kim hangi sürümü ne zaman imzaladı kaydedilir.")}</p>
        <div class="field"><label for="wItems">${t("Usul ve esaslar (her satır bir madde)")}</label><textarea class="input" id="wItems" rows="10">${esc(d.items.join("\n"))}</textarea></div>
        <div class="field"><label for="wKvkk">${t("KVKK aydınlatma metni (her satır bir madde)")}</label><textarea class="input" id="wKvkk" rows="7">${esc(d.kvkk.join("\n"))}</textarea></div>
        <div class="field"><label for="wUntil">${t("Geçerlilik sonu")}</label><input class="input" type="date" id="wUntil" value="${d.validUntil}"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("ti-upload")}${t("Yeni sürüm olarak yayınla")}</button></div>
      </form>`;
  }

  function adminLog() {
    const list = db.log.slice().sort((a, b) => b.at - a.at).slice(0, 150);
    return `
      <div class="card flush">
        <div class="card-head"><h2>${t("İşlem kaydı")}</h2><span class="small muted">${t("Son {n} işlem", { n: list.length })}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t("Zaman")}</th><th>${t("Kim")}</th><th>${t("İşlem")}</th><th>${t("Rezervasyon")}</th><th>${t("Ayrıntı")}</th></tr></thead>
          <tbody>${list.map((l) => {
            const r = db.reservations.find((x) => x.id === l.resId);
            return `<tr><td class="small">${fmtTs(l.at)}</td><td>${esc(l.by)}</td><td>${t(LOG_LABEL[l.action] || l.action)}</td>
              <td>${r ? `<button class="linkbtn" data-open="${r.id}">${esc(roomName(r.roomId))} · ${fmtDate(r.date)}</button>` : "—"}</td>
              <td class="small muted wrap">${esc(l.detail || "")}</td></tr>`;
          }).join("")}</tbody>
        </table></div>
      </div>`;
  }

  function bindAdmin() {
    const err = (id, msg) => { $(id).innerHTML = alertBox("danger", "ti-alert-circle", msg); };
    $$("[data-tab]").forEach((b) => b.onclick = () => { ui.adminTab = b.dataset.tab; ui.editRoom = null; ui.editTeam = null; render(); });
    bindResRows();
    const tab = ui.adminTab;

    if (tab === "rooms") {
      $("#roomForm").onsubmit = (e) => {
        e.preventDefault();
        const r = { name: $("#rName").value.trim(), type: $("#rType").value, mode: $("#rMode").value, capacity: +$("#rCap").value,
          divisible: $("#rDiv").checked, autoApprove: $("#rAuto").checked, location: $("#rLoc").value.trim(), equipment: $("#rEq").value.trim(), rules: $("#rRules").value.trim() };
        if (!r.name) return err("#roomErr", t("Alan adı gerekli."));
        if (!(r.capacity >= 1)) return err("#roomErr", t("Kapasite en az 1 olmalı."));
        if (ui.editRoom) Object.assign(room(ui.editRoom), r); else db.rooms.push({ id: uid(), ...r });
        toast(ui.editRoom ? t("Alan güncellendi.") : t("Alan eklendi."));
        ui.editRoom = null; save(); render();
      };
      $("#rCancel") && ($("#rCancel").onclick = () => { ui.editRoom = null; render(); });
      $$("[data-edit-room]").forEach((b) => b.onclick = () => { ui.editRoom = b.dataset.editRoom; render(); $("#rName").focus(); });
      $$("[data-del-room]").forEach((b) => b.onclick = () => {
        const id = b.dataset.delRoom;
        if (db.reservations.some((r) => r.roomId === id && ACTIVE.includes(r.status))) return toast(t("Aktif rezervasyonu olan alan silinemez."));
        if (!confirm(t("\"{name}\" silinsin mi?", { name: room(id).name }))) return;
        db.rooms = db.rooms.filter((r) => r.id !== id); db.hours = db.hours.filter((h) => h.roomId !== id);
        save(); render();
      });
    }
    if (tab === "hours") {
      $("#hourForm").onsubmit = (e) => {
        e.preventDefault();
        const h = { roomId: $("#hRoom").value, day: +$("#hDay").value, open: $("#hOpen").value, close: $("#hClose").value, audience: $("#hAud").value };
        if (!h.roomId) return err("#hourErr", t("Önce bir alan ekleyin."));
        if (!h.open || !h.close || toMin(h.close) <= toMin(h.open)) return err("#hourErr", t("Kapanış saati açılıştan sonra olmalı."));
        if (db.hours.some((x) => x.roomId === h.roomId && x.day === h.day && toMin(x.open) < toMin(h.close) && toMin(h.open) < toMin(x.close)))
          return err("#hourErr", t("Bu gün için çakışan bir saat aralığı var."));
        db.hours.push({ id: uid(), ...h }); save(); toast(t("Saat eklendi.")); render();
      };
      $$("[data-del-hour]").forEach((b) => b.onclick = () => { db.hours = db.hours.filter((h) => h.id !== b.dataset.delHour); save(); render(); });
    }
    if (tab === "closures") {
      $("#closeForm").onsubmit = (e) => {
        e.preventDefault();
        const c = { id: uid(), start: $("#cStart").value, end: $("#cEnd").value || $("#cStart").value, reason: $("#cReason").value.trim() };
        if (!c.start) return err("#closeErr", t("Başlangıç tarihi gerekli."));
        if (c.end < c.start) return err("#closeErr", t("Bitiş tarihi başlangıçtan önce olamaz."));
        if (!c.reason) return err("#closeErr", t("Sebep gerekli."));
        db.closures.push(c); save(); toast(t("Kapalı gün eklendi.")); render();
        openAffected(c);
      };
      $$("[data-affected]").forEach((b) => b.onclick = () => openAffected(db.closures.find((c) => c.id === b.dataset.affected)));
      $$("[data-del-close]").forEach((b) => b.onclick = () => { db.closures = db.closures.filter((c) => c.id !== b.dataset.delClose); save(); render(); });
    }
    if (tab === "teams") {
      $("#teamForm").onsubmit = (e) => {
        e.preventDefault();
        const members = [...new Set($("#tMembers").value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
        const x = { name: $("#tName").value.trim(), captain: $("#tCap").value.trim(), coach: $("#tCoach").value.trim(), members };
        if (!x.name) return err("#teamErr", t("Takım adı gerekli."));
        if (!dir(x.captain)) return err("#teamErr", t("Kaptan numarası rehberde bulunamadı."));
        if (x.coach && !dir(x.coach)) return err("#teamErr", t("Antrenör numarası rehberde bulunamadı."));
        const bad = members.filter((m) => !dir(m));
        if (bad.length) return err("#teamErr", t("Rehberde bulunamayan numaralar: {list}", { list: bad.join(", ") }));
        if (!x.members.includes(x.captain)) x.members.unshift(x.captain);
        if (ui.editTeam) Object.assign(team(ui.editTeam), x); else db.teams.push({ id: uid(), ...x });
        toast(ui.editTeam ? t("Takım güncellendi.") : t("Takım eklendi."));
        ui.editTeam = null; save(); render();
      };
      $("#tCancel") && ($("#tCancel").onclick = () => { ui.editTeam = null; render(); });
      $$("[data-edit-team]").forEach((b) => b.onclick = () => { ui.editTeam = b.dataset.editTeam; render(); });
      $$("[data-del-team]").forEach((b) => b.onclick = () => {
        if (!confirm(t("\"{name}\" silinsin mi?", { name: team(b.dataset.delTeam).name }))) return;
        db.teams = db.teams.filter((x) => x.id !== b.dataset.delTeam); save(); render();
      });
    }
    if (tab === "users") {
      $("#userForm").onsubmit = (e) => {
        e.preventDefault();
        const no = $("#uNo").value.trim(), role = $("#uRole").value;
        if (!dir(no)) return err("#userErr", t("Bu numara rehberde bulunamadı."));
        let u = Object.values(db.users).find((x) => x.number === no);
        if (!u) {
          const username = nameOf(no).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").split(" ").join(".");
          u = db.users[username] = { username, number: no, role, waiverVersion: null, waiverSignedAt: null };
        } else u.role = role;
        logAction("ROLE", null, `${nameOf(no)} → ${ROLES[role]}`);
        save(); toast(t("{name}: {role}", { name: nameOf(no), role: t(ROLES[role]) })); render();
      };
      $$("[data-role]").forEach((s) => s.onchange = () => {
        const u = db.users[s.dataset.role]; u.role = s.value;
        logAction("ROLE", null, `${userName(u)} → ${ROLES[s.value]}`);
        save(); toast(t("{name}: {role}", { name: userName(u), role: t(ROLES[s.value]) }));
      });
    }
    if (tab === "rules") {
      $("#rulesForm").onsubmit = (e) => {
        e.preventDefault();
        const v = (id) => Math.max(0, +$(id).value || 0);
        Object.assign(db.settings, { minLeadHours: v("#sLead"), maxDaysAhead: v("#sAhead"), cancelHours: v("#sCancel"), maxDurationMin: Math.max(15, v("#sDur")),
          weeklyQuota: Math.max(1, v("#sQuota")), noShowLimit: Math.max(1, v("#sNoShow")), noShowWindowDays: v("#sWindow"), banDays: v("#sBan"),
          semesterEnd: $("#sSem").value || db.settings.semesterEnd });
        logAction("SETTINGS", null);
        save(); $("#rulesMsg").innerHTML = alertBox("success", "ti-circle-check", t("Kurallar kaydedildi."));
      };
    }
    if (tab === "waiverdoc") {
      $("#waiverForm").onsubmit = (e) => {
        e.preventDefault();
        const items = $("#wItems").value.split("\n").map((x) => x.trim()).filter(Boolean);
        const kvkk = $("#wKvkk").value.split("\n").map((x) => x.trim()).filter(Boolean);
        if (!items.length) return;
        if (!confirm(t("Yeni sürüm yayınlansın mı? Tüm kullanıcılar metni yeniden onaylamak zorunda kalacak."))) return;
        db.waiverDoc = { version: db.waiverDoc.version + 1, publishedAt: Date.now(), validUntil: $("#wUntil").value || db.waiverDoc.validUntil, items, kvkk };
        logAction("WAIVER_PUBLISHED", null, t("Sürüm {v}", { v: db.waiverDoc.version }));
        // Yayınlayan yönetici yeni sürümü de onaylamış sayılır
        me().waiverVersion = db.waiverDoc.version; me().waiverSignedAt = Date.now();
        save(); toast(t("Sürüm {v} yayınlandı.", { v: db.waiverDoc.version })); render();
      };
    }
  }

  // ---------- Uygulama olarak kurulum (PWA) ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  render();
})();
