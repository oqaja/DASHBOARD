/**
 * DASHBOARD KONTEN — backend Apps Script untuk web app oqaja/DASHBOARD
 * ---------------------------------------------------------------
 * Project Apps Script SENDIRI (standalone), terpisah dari app Absensi dan
 * dari project "Kontrol Dashboard" milik app Absensi. Yang dipakai bareng
 * cuma datanya: tab KALENDER KONTEN di DASHBOARD KULTURAMA V1.
 *
 * TANPA LOGIN: siapa pun yang tahu URL web app ini bisa baca & edit isi
 * KALENDER KONTEN lewat dashboard. Pengaman yang tetap ada:
 *  - cuma kolom di FIELDS yang bisa diubah (EVENT ID read-only),
 *  - bisa TAMBAH baris (di bawah baris terakhir), tapi gak bisa HAPUS baris,
 *  - tiap simpan dicek dulu barisnya masih konten yang sama (judul+tanggal).
 *
 * Tab lain (INSIGHT, SOW BRAND DEAL, TIMELINE BEDAH, LIST REPORT BRAND,
 * REPORT PRODUKSI) cuma DIBACA untuk halaman Log Post, Brand, dan Overview.
 *
 * Cara pasang:
 * 1. script.google.com → New project → tempel file ini → Save.
 *    (Pakai akun Google yang bisa EDIT spreadsheet DASHBOARD KULTURAMA V1.)
 * 2. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 3. Copy URL /exec → tempel ke apiUrl di DASHBOARD_CONFIG (index.html).
 *    Update kode: Save → Deploy → Manage deployments → ✏️ → Version: New version
 *    (URL tetap sama).
 */

const VERSION = 4; // naikkan tiap ada action baru; dashboard.js ngecek lewat ?action=ping
const SPREADSHEET_ID = '1raiIO1HccW7IxN9bh9BqUJ7DOHDVBN05GKRQ5xrrfeI';
const TAB = 'KALENDER KONTEN';
// Tab lain yang cuma DIBACA (halaman Log Post, Brand, Overview). Gak ada yang ditulis ke sini.
const TAB_INSIGHT = 'INSIGHT';
const TAB_SOW = 'SOW BRAND DEAL';
const TAB_BEDAH = 'TIMELINE BEDAH';
const TAB_REPORT_BRAND = 'LIST REPORT BRAND';
const TAB_PRODUKSI = 'REPORT PRODUKSI';
const INSIGHT_LIMIT = 600;
// Field yang gak boleh diisi waktu TAMBAH konten (diisi script upload / Calendar Sync).
const ADD_SKIP = ['eventId', 'postYT', 'postIG', 'postTT', 'postFB'];
const TZ = 'Asia/Jakarta';
const STATUS_OPTS = ['', 'Acc', 'Scheduled', 'Uploaded', 'Gagal'];
const MAX_RANGE_DAYS = 62;

// Kolom dicari lewat NAMA HEADER di baris 1, bukan posisi — jadi kolom boleh
// ditambah/dihapus/dipindah di sheet tanpa bikin app salah baca.
// key yang dipakai dashboard.js -> teks header di KALENDER KONTEN.
const FIELDS = {
  tanggal: 'TANGGAL', judul: 'JUDUL KONTEN', akun: 'AKUN', segmen: 'SEGMEN',
  jamYT: 'JAM UP YT', jamIG: 'JAM UP IG', jamTT: 'JAM UP TT', jamFB: 'JAM UP FB',
  jenis: 'JENIS KONTEN', producer: 'PRODUCER', writing: 'WRITING', shooting: 'SHOOTING',
  designer: 'DESIGNER', editor: 'EDITOR', talent1: 'TALENT 1', talent2: 'TALENT 2',
  production: 'PRODUCTION',
  statusYT: 'STATUS YT', statusIG: 'STATUS IG', statusTT: 'STATUS TT', statusFB: 'STATUS FB',
  postYT: 'POST ID YT', postIG: 'POST ID IG', postTT: 'POST ID TT', postFB: 'POST ID FB',
  brand: 'BRAND TAP IN', catatan: 'CATATAN', eventId: 'EVENT ID'
};
const REQUIRED = ['tanggal', 'judul'];
// EVENT ID punya script Google Calendar Sync — cuma dibaca, gak bisa diubah dari app.
const READONLY = ['eventId'];
const JAM_KEYS = ['jamYT', 'jamIG', 'jamTT', 'jamFB']; // disimpan sebagai TEKS ("21.15"), bukan angka
const MULTI_KEYS = ['segmen', 'brand'];

function doGet(e) {
  return handle_(function () {
    const p = (e && e.parameter) || {};
    if (p.action === 'list') return list_(p.from, p.to);
    if (p.action === 'insight') return insight_(p);
    if (p.action === 'brand') return brand_();
    if (p.action === 'produksi') return produksi_();
    if (p.action === 'ping') return { ok: true, version: VERSION };
    throw err_('BAD_REQUEST', 'action tidak dikenal');
  });
}

function doPost(e) {
  return handle_(function () {
    let body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { throw err_('BAD_REQUEST', 'Body bukan JSON'); }
    if (body.action === 'setStatus') return setStatus_(body);
    if (body.action === 'updateRow') return updateRow_(body);
    if (body.action === 'addRow') return addRow_(body);
    throw err_('BAD_REQUEST', 'action tidak dikenal');
  });
}

// ---------- peta kolom ----------

// { key: index kolom 0-based } dari header baris 1. Key yang header-nya gak ada di sheet dilewati.
function colMap_(sh) {
  const lastCol = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const map = { _width: lastCol };
  Object.keys(FIELDS).forEach(function (k) {
    const i = head.indexOf(FIELDS[k]);
    if (i !== -1) map[k] = i;
  });
  REQUIRED.forEach(function (k) {
    if (map[k] == null) throw err_('SETUP', 'Kolom "' + FIELDS[k] + '" tidak ditemukan di header ' + TAB);
  });
  return map;
}

function pick_(arr, map, k) { return map[k] == null ? '' : arr[map[k]]; }

// ---------- actions ----------

function list_(from, to) {
  const f = parseIso_(from), t = parseIso_(to);
  if (!f || !t || t < f) throw err_('BAD_REQUEST', 'from/to harus YYYY-MM-DD');
  if ((t - f) / 86400000 > MAX_RANGE_DAYS) throw err_('BAD_REQUEST', 'Rentang maksimal ' + MAX_RANGE_DAYS + ' hari');

  const sh = sheet_();
  const map = colMap_(sh);
  const n = sh.getLastRow() - 1;
  if (n < 1) return { ok: true, rows: [], fields: fieldList_(map), options: {} };
  const rng = sh.getRange(2, 1, n, map._width);
  const raw = rng.getValues();
  const disp = rng.getDisplayValues();
  const rows = [];
  for (let i = 0; i < n; i++) {
    const date = cellDate_(pick_(raw[i], map, 'tanggal'), pick_(disp[i], map, 'tanggal'));
    if (!date || date < from || date > to) continue;
    if (!String(pick_(disp[i], map, 'judul')).trim()) continue;
    rows.push(rowObj_(i + 2, raw[i], disp[i], map));
  }
  return { ok: true, rows: rows, fields: fieldList_(map), options: options_(sh, map), generatedAt: new Date().toISOString() };
}

// Field yang beneran ada di sheet sekarang (dashboard.js cuma nampilin ini).
function fieldList_(map) { return Object.keys(FIELDS).filter(function (k) { return map[k] != null; }); }

// Satu baris -> objek untuk dashboard.js. `f` = semua field (teks tampilan), key-nya sesuai FIELDS.
function rowObj_(rowNum, raw, d, map) {
  const f = {};
  Object.keys(FIELDS).forEach(function (k) { if (map[k] != null) f[k] = String(d[map[k]]); });
  return {
    row: rowNum, date: cellDate_(pick_(raw, map, 'tanggal'), pick_(d, map, 'tanggal')),
    title: String(pick_(d, map, 'judul')).trim(), akun: f.akun || '', segmen: f.segmen || '',
    jamYT: f.jamYT || '', jamIG: f.jamIG || '', jamTT: f.jamTT || '', jenis: f.jenis || '',
    producer: f.producer || '', designer: f.designer || '', editor: f.editor || '',
    production: prodMark_(pick_(raw, map, 'production'), f.production),
    statusYT: f.statusYT || '', statusIG: f.statusIG || '', statusTT: f.statusTT || '', catatan: f.catatan || '',
    f: f
  };
}

// Pilihan dropdown tiap field, dari data validation baris terakhir sheet.
// Format: { key: { values: [...], multi: bool } }
function options_(sh, map) {
  const out = {};
  const dvs = sh.getRange(sh.getLastRow(), 1, 1, map._width).getDataValidations()[0];
  Object.keys(FIELDS).forEach(function (k) {
    if (map[k] == null) return;
    const dv = dvs[map[k]];
    if (!dv || dv.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;
    out[k] = { values: (dv.getCriteriaValues()[0] || []).map(String), multi: MULTI_KEYS.indexOf(k) !== -1 };
  });
  return out;
}

// Pastikan baris `row` masih konten yang sama (judul + tanggal) sebelum nulis.
function cekIdentitas_(sh, map, row, title, date) {
  const r = sh.getRange(row, 1, 1, map._width);
  const v = r.getValues()[0], dv = r.getDisplayValues()[0];
  if (String(pick_(dv, map, 'judul')).trim() !== String(title || '').trim() ||
      cellDate_(pick_(v, map, 'tanggal'), pick_(dv, map, 'tanggal')) !== date) {
    throw err_('ROW_MOVED', 'Baris di sheet sudah berubah, refresh dulu');
  }
}

// Edit satu baris. body: { row, title, date (identitas lama), changes: { key: "nilai" } }
function updateRow_(b) {
  const row = Number(b.row);
  const changes = b.changes || {};
  const keys = Object.keys(changes);
  if (!row || row < 2) throw err_('BAD_REQUEST', 'row tidak valid');
  if (!keys.length) throw err_('BAD_REQUEST', 'Tidak ada perubahan');
  keys.forEach(function (k) {
    if (!FIELDS[k] || READONLY.indexOf(k) !== -1) throw err_('BAD_REQUEST', 'Field ' + k + ' tidak boleh diubah');
  });
  if (changes.tanggal != null && !parseIso_(changes.tanggal)) throw err_('BAD_REQUEST', 'Tanggal harus YYYY-MM-DD');
  if (changes.judul != null && !String(changes.judul).trim()) throw err_('BAD_REQUEST', 'Judul tidak boleh kosong');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const map = colMap_(sh);
    keys.forEach(function (k) { if (map[k] == null) throw err_('BAD_REQUEST', 'Kolom ' + FIELDS[k] + ' sudah tidak ada di sheet'); });
    cekIdentitas_(sh, map, row, b.title, b.date);
    keys.forEach(function (k) {
      const val = String(changes[k] == null ? '' : changes[k]);
      const cell = sh.getRange(row, map[k] + 1);
      if (k === 'tanggal') cell.setValue(Utilities.parseDate(val, TZ, 'yyyy-MM-dd')); // tengah malam WIB
      else if (JAM_KEYS.indexOf(k) !== -1 && val !== '') cell.setValue("'" + val);    // paksa teks
      else cell.setValue(val);
    });
    SpreadsheetApp.flush();
    const rng = sh.getRange(row, 1, 1, map._width);
    return { ok: true, row: rowObj_(row, rng.getValues()[0], rng.getDisplayValues()[0], map) };
  } finally {
    lock.releaseLock();
  }
}

function setStatus_(b) {
  const row = Number(b.row);
  const key = 'status' + String(b.platform || '');
  const value = String(b.value == null ? '' : b.value);
  if (!row || row < 2 || ['statusYT', 'statusIG', 'statusTT'].indexOf(key) === -1) throw err_('BAD_REQUEST', 'row/platform tidak valid');
  if (STATUS_OPTS.indexOf(value) === -1) throw err_('BAD_REQUEST', 'Status tidak valid');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const map = colMap_(sh);
    if (map[key] == null) throw err_('SETUP', 'Kolom ' + FIELDS[key] + ' tidak ditemukan');
    cekIdentitas_(sh, map, row, b.title, b.date);
    sh.getRange(row, map[key] + 1).setValue(value);
    return { ok: true, row: row, platform: b.platform, value: value };
  } finally {
    lock.releaseLock();
  }
}

// Tambah konten baru di bawah baris terakhir KALENDER KONTEN.
// body: { data: { key: "nilai" }, nonce }  — nonce mencegah baris dobel kalau request terkirim ulang.
function addRow_(b) {
  const data = b.data || {};
  const keys = Object.keys(data).filter(function (k) { return String(data[k] == null ? '' : data[k]).trim() !== ''; });
  keys.forEach(function (k) {
    if (!FIELDS[k] || READONLY.indexOf(k) !== -1 || ADD_SKIP.indexOf(k) !== -1) throw err_('BAD_REQUEST', 'Field ' + k + ' tidak boleh diisi');
  });
  if (!parseIso_(data.tanggal)) throw err_('BAD_REQUEST', 'Tanggal harus YYYY-MM-DD');
  if (!String(data.judul || '').trim()) throw err_('BAD_REQUEST', 'Judul tidak boleh kosong');
  const nonce = String(b.nonce || '').replace(/[^\w-]/g, '').slice(0, 60);
  const cache = CacheService.getScriptCache();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const map = colMap_(sh);
    keys.forEach(function (k) { if (map[k] == null) throw err_('BAD_REQUEST', 'Kolom ' + FIELDS[k] + ' tidak ada di sheet'); });

    const done = nonce ? cache.get('add_' + nonce) : null;
    if (done) {
      const r0 = sh.getRange(Number(done), 1, 1, map._width);
      return { ok: true, duplicate: true, row: rowObj_(Number(done), r0.getValues()[0], r0.getDisplayValues()[0], map) };
    }

    const last = lastContentRow_(sh, map);
    const row = last + 1;
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);
    const dst = sh.getRange(row, 1, 1, map._width);
    if (last >= 2) {
      // Samakan format & dropdown dengan baris di atasnya.
      const src = sh.getRange(last, 1, 1, map._width);
      src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }
    keys.forEach(function (k) {
      const val = String(data[k]);
      const cell = sh.getRange(row, map[k] + 1);
      if (k === 'tanggal') cell.setValue(Utilities.parseDate(val, TZ, 'yyyy-MM-dd'));
      else if (JAM_KEYS.indexOf(k) !== -1) cell.setValue("'" + val);
      else cell.setValue(val);
    });
    SpreadsheetApp.flush();
    if (nonce) cache.put('add_' + nonce, String(row), 600);
    const r = sh.getRange(row, 1, 1, map._width);
    return { ok: true, row: rowObj_(row, r.getValues()[0], r.getDisplayValues()[0], map) };
  } finally {
    lock.releaseLock();
  }
}

// Baris terakhir yang judul ATAU tanggalnya terisi (baris kosong berformat di bawahnya diabaikan).
function lastContentRow_(sh, map) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const j = sh.getRange(2, map.judul + 1, n - 1, 1).getDisplayValues();
  const t = sh.getRange(2, map.tanggal + 1, n - 1, 1).getDisplayValues();
  for (let i = n - 2; i >= 0; i--) {
    if (String(j[i][0]).trim() || String(t[i][0]).trim()) return i + 2;
  }
  return 1;
}

// ---------- halaman baca-saja: Log Post (INSIGHT) ----------

const INSIGHT_COLS = {
  tanggal: 'TANGGAL UPLOAD', judul: 'JUDUL', jenis: 'JENIS KONTEN', platform: 'PLATFORM', akun: 'AKUN',
  link: 'LINK VIDEO', views: 'VIEWS', subs: 'SUBSCRIBER GAINED', likes: 'LIKES', comments: 'COMMENTS',
  shares: 'SHARES', saved: 'SAVED', updated: 'TERAKHIR UPDATE', postId: 'POST ID', brand: 'BRAND TAP IN'
};
const INSIGHT_NUM = ['views', 'subs', 'likes', 'comments', 'shares', 'saved'];

// params: from, to (YYYY-MM-DD, opsional), q, platform, akun, jenis
function insight_(p) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB_INSIGHT);
  if (!sh) throw err_('SETUP', 'Tab ' + TAB_INSIGHT + ' tidak ditemukan');
  const n = sh.getLastRow(), w = sh.getLastColumn();
  if (n < 2) return { ok: true, rows: [], total: emptyTotal_(), matched: 0, truncated: false };
  // Cukup teks tampilannya (sekali baca); tanggal "26/10/2026 16:51" diurai dari teks.
  const disp = sh.getRange(1, 1, n, w).getDisplayValues();
  return insightFilter_(disp, disp, p, postDates_());
}

// Kolom "Tanggal Upload" di INSIGHT sering kosong. Cadangannya: tanggal konten di
// KALENDER KONTEN / KALENDER AFFILIATE yang POST ID-nya sama. { postId: 'YYYY-MM-DD' }
const TAB_AFFILIATE = 'KALENDER AFFILIATE';
// Disimpan di cache 10 menit biar Log Post gak baca ulang dua tab kalender tiap kali dibuka.
function postDates_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('postDates_v1');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const out = {};
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [TAB, TAB_AFFILIATE].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const n = sh.getLastRow() - 1, w = sh.getLastColumn();
    const head = sh.getRange(1, 1, 1, w).getDisplayValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
    const iT = head.indexOf('TANGGAL');
    const ids = ['POST ID YT', 'POST ID IG', 'POST ID TT', 'POST ID FB'].map(function (h) { return head.indexOf(h); }).filter(function (i) { return i !== -1; });
    if (iT === -1 || !ids.length) return;
    // Baca kolom yang perlu saja (tanggal + post ID), bukan seluruh tab.
    const tgl = sh.getRange(2, iT + 1, n, 1).getDisplayValues();
    ids.forEach(function (j) {
      const col = sh.getRange(2, j + 1, n, 1).getDisplayValues();
      for (let i = 0; i < n; i++) {
        const id = String(col[i][0]).trim();
        if (!id || out[id]) continue;
        const d = cellDate_(null, tgl[i][0]);
        if (d) out[id] = d;
      }
    });
  });
  const s = JSON.stringify(out);
  if (s.length < 95000) cache.put('postDates_v1', s, 600);
  return out;
}

// Dipisah dari insight_ biar bisa dites tanpa SpreadsheetApp.
function insightFilter_(raw, disp, p, postDates) {
  postDates = postDates || {};
  const head = disp[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const col = {};
  Object.keys(INSIGHT_COLS).forEach(function (k) { const i = head.indexOf(INSIGHT_COLS[k]); if (i !== -1) col[k] = i; });
  if (col.judul == null) throw err_('SETUP', 'Kolom JUDUL tidak ditemukan di ' + TAB_INSIGHT);
  const from = parseIso_(p.from) ? p.from : '', to = parseIso_(p.to) ? p.to : '';
  const q = String(p.q || '').trim().toLowerCase();
  const plat = String(p.platform || ''), akun = String(p.akun || ''), jenis = String(p.jenis || '');
  const hits = [];
  const total = emptyTotal_();
  for (let i = 1; i < disp.length; i++) {
    const d = disp[i];
    const title = String(d[col.judul] || '').trim();
    if (!title) continue;
    const g = function (k) { return col[k] == null ? '' : String(d[col[k]]).trim(); };
    let date = col.tanggal == null ? null : cellDateTime_(raw[i][col.tanggal], d[col.tanggal]);
    if (!date && g('postId') && postDates[g('postId')]) date = { date: postDates[g('postId')], time: '', fromKalender: true };
    if ((from || to) && (!date || (from && date.date < from) || (to && date.date > to))) continue;
    if (plat && g('platform') !== plat) continue;
    if (akun && g('akun') !== akun) continue;
    if (jenis && g('jenis') !== jenis) continue;
    if (q && (title + ' ' + g('brand') + ' ' + g('postId')).toLowerCase().indexOf(q) === -1) continue;
    const r = { line: i + 1, date: date ? date.date : '', time: date ? date.time : '', title: title,
      jenis: g('jenis'), platform: g('platform'), akun: g('akun'), link: g('link'), postId: g('postId'),
      brand: g('brand'), updated: g('updated'), dateFromKalender: !!(date && date.fromKalender) };
    INSIGHT_NUM.forEach(function (k) { r[k] = num_(g(k)); if (r[k] != null) total[k] += r[k]; });
    hits.push(r);
  }
  // Terbaru dulu; yang tanpa tanggal ditaruh paling bawah sesuai urutan sheet (atas = terbaru).
  hits.sort(function (a, b) {
    if (a.date && b.date) return (b.date + b.time).localeCompare(a.date + a.time) || a.line - b.line;
    if (a.date || b.date) return a.date ? -1 : 1;
    return a.line - b.line;
  });
  return { ok: true, rows: hits.slice(0, INSIGHT_LIMIT), total: total, matched: hits.length, truncated: hits.length > INSIGHT_LIMIT };
}
function emptyTotal_() { const t = {}; INSIGHT_NUM.forEach(function (k) { t[k] = 0; }); return t; }
// "8.498" -> 8498, "37,88" -> 37.88, "-" / "" -> null
function num_(s) {
  s = String(s == null ? '' : s).trim();
  if (!s || s === '-') return null;
  const v = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}
function cellDateTime_(v, disp) {
  if (v instanceof Date && !isNaN(v)) return { date: Utilities.formatDate(v, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(v, TZ, 'HH:mm') };
  const s = String(disp || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return { date: iso_(+m[3], +m[2], +m[1]), time: m[4] ? ('0' + m[4]).slice(-2) + ':' + m[5] : '' };
  const d = cellDate_(v, disp);
  return d ? { date: d, time: '' } : null;
}

// ---------- halaman baca-saja: Brand ----------

function brand_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const read = function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 1) return null;
    return sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  };
  const sow = read(TAB_SOW), bedah = read(TAB_BEDAH), rep = read(TAB_REPORT_BRAND);
  return {
    ok: true,
    sow: sow ? parseSow_(sow) : [],
    bedah: bedah ? parseBedah_(bedah) : { headers: [], rows: [] },
    reports: rep ? parseReports_(rep) : [],
    missing: [sow ? '' : TAB_SOW, bedah ? '' : TAB_BEDAH, rep ? '' : TAB_REPORT_BRAND].filter(String)
  };
}

const BULAN_ID_ = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
function bulanName_(s) { const u = String(s || '').trim().toUpperCase(); return BULAN_ID_.indexOf(u) !== -1 ? u : ''; }
function trimRow_(r) { return r.map(function (c) { return String(c == null ? '' : c).trim(); }); }
function filled_(r) { return r.filter(function (c) { return c !== ''; }); }

// SOW BRAND DEAL: blok per bulan -> baris judul bulan, header (Brand, Artikel, ...),
// sub-header (Carousel, Status, Video Pendek, Status, ...), lalu baris brand.
function parseSow_(disp) {
  const out = [];
  let month = '', cols = null;
  for (let i = 0; i < disp.length; i++) {
    const row = trimRow_(disp[i]);
    const f = filled_(row);
    if (!f.length) continue;
    if (f.length <= 2 && bulanName_(f[0])) { month = bulanName_(f[0]); continue; }
    const up = row.map(function (c) { return c.toUpperCase(); });
    if (up.indexOf('BRAND') !== -1 && up.indexOf('ARTIKEL') !== -1) {
      cols = { brand: up.indexOf('BRAND'), artikel: up.indexOf('ARTIKEL'), jumlah: up.indexOf('JUMLAH SEPATU'),
        status: up.indexOf('STATUS'), ket: up.indexOf('KETERANGAN'), sow: [] };
      const sub = trimRow_(disp[i + 1] || []).map(function (c) { return c.toUpperCase(); });
      ['CAROUSEL', 'VIDEO PENDEK', 'VIDEO PANJANG', 'AFFILIATE'].forEach(function (name) {
        const j = sub.indexOf(name);
        if (j !== -1) cols.sow.push({ name: name, col: j, statusCol: sub[j + 1] === 'STATUS' ? j + 1 : -1 });
      });
      if (cols.sow.length) i++;
      continue;
    }
    if (!cols) continue;
    const brand = row[cols.brand];
    if (!brand) continue;
    const at = function (j) { return j >= 0 ? (row[j] || '') : ''; };
    out.push({
      month: month, brand: brand, artikel: at(cols.artikel), jumlah: at(cols.jumlah), status: at(cols.status), ket: at(cols.ket),
      sow: cols.sow.map(function (s) { return { name: s.name, target: at(s.col), status: at(s.statusCol) }; })
    });
  }
  return out;
}

// TIMELINE BEDAH: header di baris pertama yang ada BRAND + NAMA ARTIKEL, baris bulan di antaranya.
function parseBedah_(disp) {
  let headers = null, idx = null, month = '';
  const rows = [];
  for (let i = 0; i < disp.length; i++) {
    const row = trimRow_(disp[i]);
    const f = filled_(row);
    if (!f.length) continue;
    if (!headers) {
      const up = row.map(function (c) { return c.toUpperCase(); });
      if (up.indexOf('BRAND') !== -1 && up.indexOf('NAMA ARTIKEL') !== -1) {
        headers = []; idx = [];
        row.forEach(function (h, j) { if (h) { headers.push(h.toUpperCase()); idx.push(j); } });
      }
      continue;
    }
    if (f.length <= 2 && bulanName_(f[0])) { month = bulanName_(f[0]); continue; }
    const brand = row[idx[headers.indexOf('BRAND')]];
    if (!brand) continue;
    const o = { month: month };
    headers.forEach(function (h, k) { o[h] = row[idx[k]] || ''; });
    rows.push(o);
  }
  return { headers: headers || [], rows: rows };
}

function parseReports_(disp) {
  const out = [];
  disp.slice(1).forEach(function (r) {
    r = trimRow_(r);
    if (r[0] && /^https?:\/\//i.test(r[1] || '')) out.push({ brand: r[0], link: r[1] });
  });
  return out;
}

// ---------- halaman baca-saja: Overview (REPORT PRODUKSI) ----------

function produksi_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB_PRODUKSI);
  if (!sh || sh.getLastRow() < 1) return { ok: true, months: [] };
  const rng = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn());
  return { ok: true, months: parseProduksi_(rng.getValues(), rng.getDisplayValues()) };
}

// Blok per bulan: baris tanggal (01/04/2026 | APRIL), header KONTEN | SELESAI | ..., lalu baris konten.
function parseProduksi_(raw, disp) {
  const months = [];
  let cur = null, cols = null;
  for (let i = 0; i < disp.length; i++) {
    const row = trimRow_(disp[i]);
    if (!filled_(row).length) continue;
    const d = cellDate_(raw[i][0], row[0]);
    if (d) { cur = { month: d.slice(0, 7), label: row[1] || '', rows: [] }; months.push(cur); cols = null; continue; }
    const up = row.map(function (c) { return c.toUpperCase(); });
    if (up[0] === 'KONTEN') {
      cols = { selesai: up.indexOf('SELESAI'), progres: up.indexOf('PROGRES'), target: up.indexOf('TARGET BULANAN'),
        update: up.indexOf('TANGGAL UPDATE'), oleh: up.indexOf('OLEH') };
      continue;
    }
    if (!cur || !cols || !row[0]) continue;
    const at = function (j) { return j >= 0 ? (row[j] || '') : ''; };
    cur.rows.push({ konten: row[0], selesai: num_(at(cols.selesai)), progres: at(cols.progres), target: num_(at(cols.target)),
      update: at(cols.update), oleh: at(cols.oleh) });
  }
  return months.filter(function (m) { return m.rows.length; });
}

// ---------- helpers ----------

function sheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB);
  if (!sh) throw err_('SETUP', 'Tab ' + TAB + ' tidak ditemukan');
  return sh;
}

const MON_ = { jan:1, feb:2, mar:3, apr:4, may:5, mei:5, jun:6, jul:7, aug:8, agu:8, agt:8, sep:9, oct:10, okt:10, nov:11, dec:12, des:12 };
function cellDate_(v, disp) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(disp || v || '').trim();
  let m = s.match(/^(\d{1,2})[-\s\/]([A-Za-z]{3,})[-\s\/](\d{4})$/);
  if (m && MON_[m[2].slice(0, 3).toLowerCase()]) return iso_(+m[3], MON_[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso_(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso_(+m[1], +m[2], +m[3]);
  return null;
}
// Kolom PRODUCTION = dropdown ✅ / ❌ (jaga-jaga juga kalau suatu saat jadi checkbox).
// Balikin 'done' (✅ / centang), 'no' (❌), atau '' (kosong). Cuma 'done' = beres.
function prodMark_(v, disp) {
  if (v === true) return 'done';
  if (v === false) return '';
  const s = String(disp == null ? '' : disp).trim();
  if (!s) return '';
  if (s.indexOf('✅') !== -1 || s.indexOf('✔') !== -1 || s.indexOf('✓') !== -1 || s.toUpperCase() === 'TRUE') return 'done';
  return 'no';
}
function iso_(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
function parseIso_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function err_(code, message) { const e = new Error(message); e.code = code; return e; }

function handle_(fn) {
  let out;
  try { out = fn(); }
  catch (e) { out = { ok: false, code: e.code || 'SERVER_ERROR', message: String(e.message || e) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
