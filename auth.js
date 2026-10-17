// =====================================================================
// LOGIN WEB APP DASHBOARD
//
// Web app ini jalan di oqaja.github.io, beda domain dari app Absensi
// (hrkulturama.github.io), jadi token login Absensi gak kebaca otomatis.
// Login di sini pakai nama + PIN Absensi yang sama: dikirim ke backend
// Absensi (action 'login'), token hasilnya disimpan di localStorage
// domain ini dengan key yang sama ('absensi_token' / 'absensi_role'),
// supaya dashboard.js bisa dipakai apa adanya (salinan persis dari
// hrKulturama/ABSENSI).
//
// Backend data tetap Apps Script "Kontrol Dashboard" (KONTROL_API_URL di
// dashboard.js), yang verifikasi token pakai HR_TOKEN_SECRET yang sama.
// =====================================================================
(() => {
  // Backend Absensi (sama dengan SCRIPT_URL di app.js Absensi) — dipakai cuma buat login.
  const ABSENSI_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDjfUyqGAaSfJxBHZ2ULgXyttVSgTJFBt9D8KF6m-wvbcNEzEbol9DbtzzPoxMXP79/exec';
  // Daftar nama karyawan (sama dengan getKaryawan di app Absensi). Kalau gagal, nama diketik manual.
  const KARYAWAN_URL = 'https://absensi-backend-ruby.vercel.app/api/getKaryawan';
  const ROLE_BOLEH = ['kreatif', 'hr', 'admin'];

  const $ = (id) => document.getElementById(id);
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Payload token = base64url(JSON {nama, role, exp}). Dibaca cuma buat cek kadaluarsa di sisi
  // browser; keabsahan tetap dicek server tiap request.
  function tokenExp(token) {
    try {
      const b64 = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      return Number(JSON.parse(json).exp) || 0;
    } catch (e) { return 0; }
  }
  function sesiValid() {
    const t = ls.get('absensi_token');
    return !!t && tokenExp(t) > Date.now() && ROLE_BOLEH.includes(String(ls.get('absensi_role') || '').toLowerCase());
  }

  function hapusSesi() { ls.del('absensi_token'); ls.del('absensi_role'); }

  function tampilkanLogin(pesan) {
    $('appGate').classList.add('active');
    $('userBar').hidden = true;
    const err = $('loginError');
    err.innerHTML = '';
    if (pesan) { const d = document.createElement('div'); d.className = 'status-box status-fail'; d.textContent = pesan; err.appendChild(d); }
    const last = ls.get('absensi_nama');
    if (last) { $('loginNama').value = last; $('loginNamaText').value = last; }
    setTimeout(() => ($('loginNama').hidden ? $('loginNamaText') : $('loginPin')).focus(), 0);
  }

  function bukaDashboard() {
    $('appGate').classList.remove('active');
    $('userBar').hidden = false;
    $('userName').textContent = ls.get('absensi_nama') || '—';
    if (typeof window.updateDashboardNav === 'function') window.updateDashboardNav();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }

  // ---- hook yang dipanggil dashboard.js ----
  // Token ditolak server -> balik ke layar login.
  window.sesiHabis = function () { hapusSesi(); tampilkanLogin('Sesi kamu udah habis. Masuk lagi ya.'); };
  // dashboard.js manggil goPage('home') kalau role gak boleh; di web app gak ada Home, jadi ke login.
  window.goPage = function () { hapusSesi(); tampilkanLogin('Akun kamu nggak punya akses ke Dashboard.'); };

  async function muatNama() {
    const sel = $('loginNama');
    try {
      const res = await fetch(KARYAWAN_URL);
      const data = await res.json();
      if (data.result !== 'success' || !Array.isArray(data.data)) throw new Error('bad');
      const terdaftar = data.data.filter(k => k.terdaftar).map(k => k.nama).sort((a, b) => a.localeCompare(b, 'id'));
      if (!terdaftar.length) throw new Error('empty');
      sel.innerHTML = '<option value="">— Pilih nama —</option>';
      terdaftar.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
      const last = ls.get('absensi_nama'); if (last && terdaftar.includes(last)) sel.value = last;
    } catch (e) {
      // Daftar nama gak bisa diambil dari domain ini -> ketik manual.
      sel.hidden = true; sel.required = false;
      const t = $('loginNamaText'); t.hidden = false; t.required = true;
      $('loginNama').previousElementSibling.htmlFor = 'loginNamaText';
    }
  }

  async function login(e) {
    e.preventDefault();
    const nama = ($('loginNama').hidden ? $('loginNamaText').value : $('loginNama').value).trim();
    const pin = $('loginPin').value.trim();
    const err = $('loginError'); err.innerHTML = '';
    const fail = (m) => { const d = document.createElement('div'); d.className = 'status-box status-fail'; d.textContent = m; err.appendChild(d); };
    if (!nama) return fail('Pilih atau tulis nama kamu dulu.');
    if (!/^\d{4}$/.test(pin)) return fail('PIN harus 4 digit angka.');

    const btn = $('loginBtn'); btn.disabled = true; btn.textContent = 'Memeriksa…';
    try {
      const res = await fetch(ABSENSI_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', nama, pin }) });
      const data = await res.json();
      if (data.result !== 'success' || !data.token) {
        if (data.message === 'BELUM_DAFTAR') return fail('Nama ini belum punya PIN. Daftar dulu lewat app Absensi.');
        return fail(data.message || 'Nama atau PIN salah.');
      }
      const role = String(data.role || '').toLowerCase();
      if (!ROLE_BOLEH.includes(role)) return fail('Akun kamu nggak punya akses ke Dashboard. Khusus Kreatif, HR, dan admin.');
      ls.set('absensi_token', data.token);
      ls.set('absensi_role', role);
      ls.set('absensi_nama', data.nama || nama);
      $('loginPin').value = '';
      bukaDashboard();
    } catch (e2) {
      fail('Gagal menghubungi server. Cek koneksi internet.');
    } finally {
      btn.disabled = false; btn.textContent = 'Masuk';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('loginForm').addEventListener('submit', login);
    $('logoutBtn').onclick = () => { hapusSesi(); tampilkanLogin(); };
    muatNama();
    if (sesiValid()) bukaDashboard(); else { hapusSesi(); tampilkanLogin(); }
  });
})();
