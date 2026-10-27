// =====================================================================
// HALAMAN LAIN + NAVIGASI (oqaja/DASHBOARD)
//
//   #/upload    Upload Harian  -> dashboard.js (halaman yang sudah ada)
//   #/tugas     Tugas Saya     -> kerjaan satu orang, dari data Upload Harian
//   #/overview  Overview       -> ringkasan sebulan + target REPORT PRODUKSI
//   #/log       Log Post       -> tab INSIGHT (baca saja)
//   #/brand     Brand          -> SOW BRAND DEAL, TIMELINE BEDAH, LIST REPORT BRAND (baca saja)
//
// Semua akses backend lewat window.KontenApp (diekspor dashboard.js).
// Data tiap halaman disimpan di localStorage biar langsung tampil saat dibuka lagi.
// =====================================================================
(() => {
  const K = window.KontenApp;
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const nf = new Intl.NumberFormat('id-ID');
  const fmtNum = (v) => (v == null || v === '' ? '—' : nf.format(v));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const splitMulti = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const jamWib = (d) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(d);
  function dayLabel(iso) {
    if (!iso) return '—';
    if (iso === K.todayJkt()) return 'Hari ini';
    const f = K.fmtDay(iso);
    return `${f.hari}, ${f.tgl} ${f.bln}`;
  }

  // ---------- kerangka halaman ----------
  function pageHead(title, sub, onRefresh, extra) {
    const h = el('div', 'pg-head');
    const t = el('div');
    t.appendChild(el('h1', 'pg-title', title));
    if (sub) { const s = el('div', 'home-sub', sub); s.dataset.role = 'sub'; t.appendChild(s); }
    h.appendChild(t);
    const act = el('div', 'pg-head-act');
    if (extra) act.appendChild(extra);
    if (onRefresh) {
      const b = el('button', 'dash-refresh', '↻'); b.type = 'button'; b.title = 'Tarik data terbaru'; b.setAttribute('aria-label', 'Tarik data terbaru');
      b.onclick = onRefresh; act.appendChild(b);
    }
    h.appendChild(act);
    return h;
  }
  function msgCard(title, body, bad) {
    const c = el('div', 'card dash-msg' + (bad ? ' err' : ''));
    c.appendChild(el('b', null, title));
    if (body) c.appendChild(el('div', null, body));
    return c;
  }
  function errCard(err) {
    if (/action tidak dikenal/i.test(err.message || '')) {
      return msgCard('Backend perlu di-deploy ulang',
        'Halaman ini butuh Apps Script versi baru. Buka project Apps Script dashboard, tempel ulang apps-script/dashboard-backend.gs, lalu Deploy → Manage deployments → ✏️ → New version.', true);
    }
    if (err.code === 'NETWORK') return msgCard('Lagi offline', 'Belum ada data tersimpan untuk halaman ini. Coba lagi saat online.', true);
    return msgCard('Gagal ambil data', err.message || 'Error', true);
  }
  function chips(list, cur, onPick, label) {
    const w = el('div', 'dash-chips'); w.setAttribute('role', 'group'); if (label) w.setAttribute('aria-label', label);
    list.forEach((v) => {
      const val = Array.isArray(v) ? v[0] : v, text = Array.isArray(v) ? v[1] : v;
      const b = el('button', 'dash-chip', text); b.type = 'button';
      b.setAttribute('aria-pressed', cur === val ? 'true' : 'false');
      b.onclick = () => onPick(val);
      w.appendChild(b);
    });
    return w;
  }
  function kpi(label, value, sub, cls) {
    const k = el('div', 'kpi' + (cls ? ' ' + cls : ''));
    k.appendChild(el('div', 'kpi-l', label));
    k.appendChild(el('div', 'kpi-v', value));
    if (sub) k.appendChild(el('div', 'kpi-s', sub));
    return k;
  }
  function bar(p, cls) {
    const b = el('div', 'bar' + (cls ? ' ' + cls : ''));
    const i = el('span'); i.style.width = Math.max(0, Math.min(100, p)) + '%';
    b.appendChild(i);
    return b;
  }
  // tabel sederhana: cols = [{ t: 'Judul', k: fn(row)->Node|string, cls }]
  function table(cols, rows, opts) {
    const wrap = el('div', 'tbl-wrap');
    const t = el('table', 'tbl' + (opts && opts.cls ? ' ' + opts.cls : ''));
    const thead = el('thead'); const tr = el('tr');
    cols.forEach((c) => tr.appendChild(el('th', c.cls || null, c.t)));
    thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody');
    rows.forEach((r) => {
      const row = el('tr');
      cols.forEach((c) => {
        const td = el('td', c.cls || null);
        td.dataset.label = c.t;
        const v = c.k(r);
        if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === '' ? '—' : String(v);
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  function tag(text, cls) { return el('span', 'tag-badge' + (cls ? ' ' + cls : ''), text); }
  function link(text, href) { const a = el('a', 'lnk', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }

  // =====================================================================
  // TUGAS SAYA
  // =====================================================================
  const ROLE_KEYS = [['producer', 'Producer'], ['designer', 'Desainer'], ['editor', 'Editor'], ['talent1', 'Talent'], ['talent2', 'Talent']];
  const isDone = (s) => /✅|✔|✓|^\s*true\s*$/i.test(String(s || ''));
  const tg = { person: lsGet('tugas_person') || '', period: lsGet('tugas_period') || '7' };

  function peopleList() {
    const set = new Set();
    K.rows().forEach((r) => ROLE_KEYS.forEach(([k]) => splitMulti(r.f[k]).forEach((n) => set.add(n))));
    const o = K.options();
    ROLE_KEYS.forEach(([k]) => { if (o[k]) o[k].values.forEach((n) => { if (String(n).trim()) set.add(String(n).trim()); }); });
    return Array.from(set).filter((n) => !isDone(n) && n !== '❌').sort((a, b) => a.localeCompare(b, 'id'));
  }
  function rolesOf(rec, person) {
    const out = [];
    ROLE_KEYS.forEach(([k, label]) => { if (splitMulti(rec.f[k]).includes(person) && !out.includes(label)) out.push(label); });
    return out;
  }
  function stageOf(rec) {
    if (rec.production) return 'Beres';
    if (rec.f.writing !== undefined && !isDone(rec.f.writing)) return 'Writing';
    if (/video/i.test(rec.jenis) && rec.f.shooting !== undefined && !isDone(rec.f.shooting)) return 'Shooting';
    return 'Produksi';
  }

  function renderTugas() {
    const root = $('pgTugas'); root.innerHTML = '';
    const people = peopleList();
    const picker = el('select', 'pg-select'); picker.setAttribute('aria-label', 'Pilih nama');
    [''].concat(people).forEach((n) => { const o = el('option', null, n || 'Pilih nama…'); o.value = n; picker.appendChild(o); });
    if (tg.person && !people.includes(tg.person)) { const o = el('option', null, tg.person); o.value = tg.person; picker.appendChild(o); }
    picker.value = tg.person;
    picker.onchange = () => { tg.person = picker.value; lsSet('tugas_person', tg.person); renderTugas(); };
    root.appendChild(pageHead(tg.person ? `Halo, ${tg.person}` : 'Tugas Saya',
      'Konten yang kamu pegang sebagai producer, desainer, editor, atau talent.', () => K.load(true), picker));

    if (!K.loadedAt()) {
      const e = K.error();
      root.appendChild(e && !K.loading() ? msgCard(e.title, e.body, true) : el('div', 'loading-text', 'Memuat konten…'));
      return;
    }
    if (!tg.person) {
      const box = el('div', 'pick-grid');
      people.forEach((n) => {
        const b = el('button', 'pick-btn', n); b.type = 'button';
        b.onclick = () => { tg.person = n; lsSet('tugas_person', n); renderTugas(); };
        box.appendChild(b);
      });
      root.appendChild(el('div', 'section-label', 'Kamu siapa?'));
      root.appendChild(people.length ? box : el('div', 'loading-text', 'Belum ada nama di kolom PIC.'));
      return;
    }

    const today = K.todayJkt();
    const limit = tg.period === 'today' ? today : tg.period === '7' ? K.shiftDate(today, 7) : '9999-12-31';
    const mine = K.rows().map((r) => ({ r, roles: rolesOf(r, tg.person), stage: stageOf(r) })).filter((x) => x.roles.length);
    // Yang belum beres dan tanggalnya sudah lewat selalu ikut (telat).
    const shown = mine.filter((x) => (x.r.date <= limit && (x.r.date >= today || x.stage !== 'Beres' || tg.period === 'all'))
      && !(x.stage === 'Beres' && x.r.date < K.shiftDate(today, -3) && tg.period !== 'all'));
    const telat = shown.filter((x) => x.stage !== 'Beres' && (x.r.date < today || K.rowHealth(x.r) === 'bad'));

    const ctl = el('div', 'pg-ctl');
    ctl.appendChild(chips([['today', 'Hari ini'], ['7', '7 hari ke depan'], ['all', 'Semua (±3 minggu)']], tg.period,
      (v) => { tg.period = v; lsSet('tugas_period', v); renderTugas(); }, 'Periode'));
    root.appendChild(ctl);

    const k = el('div', 'kpis');
    k.appendChild(kpi('Hari ini', String(mine.filter((x) => x.r.date === today).length), 'konten'));
    k.appendChild(kpi('Belum beres', String(shown.filter((x) => x.stage !== 'Beres').length), 'di periode ini'));
    k.appendChild(kpi('Telat', String(telat.length), 'lewat tanggal / jam tayang', telat.length ? 'bad' : ''));
    k.appendChild(kpi('Beres', String(shown.filter((x) => x.stage === 'Beres').length), 'production ✅', 'ok'));
    root.appendChild(k);

    const board = el('div', 'kanban');
    [['Writing', 'Naskah belum ✅'], ['Shooting', 'Shooting belum ✅'], ['Produksi', 'Desain / edit'], ['Beres', 'Production ✅']].forEach(([st, hint]) => {
      const items = shown.filter((x) => x.stage === st).sort((a, b) => a.r.date.localeCompare(b.r.date));
      const col = el('section', 'kb-col');
      const hd = el('div', 'kb-head');
      hd.appendChild(el('span', 'kb-name', st));
      hd.appendChild(el('span', 'kb-count', String(items.length)));
      col.appendChild(hd);
      col.appendChild(el('div', 'kb-hint', hint));
      if (!items.length) col.appendChild(el('div', 'kb-empty', 'Kosong'));
      items.forEach((x) => col.appendChild(taskCard(x, today)));
      board.appendChild(col);
    });
    root.appendChild(board);
  }

  function taskCard(x, today) {
    const r = x.r;
    const c = el('article', 'kb-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
    c.onclick = () => K.openDetail(r.rowNum);
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); K.openDetail(r.rowNum); } };
    const top = el('div', 'kb-top');
    const late = x.stage !== 'Beres' && (r.date < today || K.rowHealth(r) === 'bad');
    top.appendChild(el('span', 'kb-date' + (late ? ' bad' : r.date === today ? ' today' : ''), dayLabel(r.date) + (late ? ' · telat' : '')));
    if (r.akun) top.appendChild(tag(r.akun, 'dash-akun'));
    c.appendChild(top);
    c.appendChild(el('div', 'kb-title', r.title));
    const meta = el('div', 'dash-tags');
    if (r.jenis) meta.appendChild(tag(r.jenis, 'dash-jenis ' + (K.JENIS_CLS[r.jenis] || '')));
    x.roles.forEach((ro) => meta.appendChild(tag(ro, 'role')));
    c.appendChild(meta);
    const jam = K.PLATS.map((p) => (r.plat[p].jam ? `${p} ${r.plat[p].jam.label}` : '')).filter(Boolean).join(' · ');
    if (jam) c.appendChild(el('div', 'kb-sub', jam));
    return c;
  }

  // =====================================================================
  // OVERVIEW
  // =====================================================================
  const ov = { month: K.todayJkt().slice(0, 7), data: {}, loading: false, err: null, produksi: lsGet('ov_produksi'), prodErr: null };
  function monthRange(m) {
    const [y, mo] = m.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
  }
  function shiftMonth(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); }
  function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][mo - 1]} ${y}`; }

  async function loadOverview(force) {
    const m = ov.month;
    if (!ov.data[m]) { const c = lsGet('ov_' + m); if (c) ov.data[m] = c; }
    if (ov.loading) return;
    const fresh = ov.data[m] && ov.data[m].at && Date.now() - ov.data[m].at < 5 * 60 * 1000;
    if (fresh && !force && ov.produksi) return;
    ov.loading = true; ov.err = null; renderOverview();
    try {
      const r = monthRange(m);
      const tasks = [K.api('GET', { action: 'list', from: r.from, to: r.to })];
      if (!ov.produksi || force) tasks.push(K.api('GET', { action: 'produksi' }).catch((e) => { ov.prodErr = e; return null; }));
      const [list, prod] = await Promise.all(tasks);
      ov.data[m] = { rows: list.rows, at: Date.now() };
      lsSet('ov_' + m, ov.data[m]);
      if (prod) { ov.produksi = prod.months || []; ov.prodErr = null; lsSet('ov_produksi', ov.produksi); }
      if (force) K.toast('Data terbaru udah ditarik.');
    } catch (e) { ov.err = e; }
    finally { ov.loading = false; if (current === 'overview') renderOverview(); }
  }

  function renderOverview() {
    const root = $('pgOverview'); root.innerHTML = '';
    const nav = el('div', 'month-nav');
    const prev = el('button', 'btn btn-secondary btn-sm', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Bulan sebelumnya');
    const next = el('button', 'btn btn-secondary btn-sm', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Bulan berikutnya');
    prev.onclick = () => { ov.month = shiftMonth(ov.month, -1); renderOverview(); loadOverview(false); };
    next.onclick = () => { ov.month = shiftMonth(ov.month, 1); renderOverview(); loadOverview(false); };
    nav.appendChild(prev); nav.appendChild(el('span', 'month-label', monthLabel(ov.month))); nav.appendChild(next);
    const d = ov.data[ov.month];
    root.appendChild(pageHead('Overview', ov.loading ? 'Memuat…' : d ? 'Dari KALENDER KONTEN · update ' + jamWib(new Date(d.at)) + ' WIB' : '', () => loadOverview(true), nav));

    if (!d) { root.appendChild(ov.err ? errCard(ov.err) : el('div', 'loading-text', 'Memuat ringkasan bulan ini…')); return; }
    if (ov.err) root.appendChild(errCard(ov.err));
    const recs = d.rows.map(K.toRecord);
    if (!recs.length) { root.appendChild(el('div', 'coming-soon-card', 'Belum ada konten di bulan ini.')); return; }

    const beres = recs.filter((r) => r.production).length;
    const telat = recs.filter((r) => K.rowHealth(r) === 'bad').length;
    const gagal = recs.filter((r) => K.PLATS.some((p) => r.plat[p].status === 'Gagal')).length;
    const k = el('div', 'kpis');
    k.appendChild(kpi('Total konten', String(recs.length), monthLabel(ov.month)));
    const kb = kpi('Production beres', `${beres}`, `${pct(beres, recs.length)}% dari ${recs.length}`, beres === recs.length ? 'ok' : '');
    kb.appendChild(bar(pct(beres, recs.length), 'ok')); k.appendChild(kb);
    k.appendChild(kpi('Telat', String(telat), 'belum beres & lewat jadwal', telat ? 'bad' : ''));
    k.appendChild(kpi('Upload gagal', String(gagal), 'status Gagal di salah satu platform', gagal ? 'bad' : ''));
    root.appendChild(k);

    // Target REPORT PRODUKSI
    root.appendChild(el('h2', 'pg-h2', 'Target bulanan'));
    // Blok bulan yang angkanya belum diisi dianggap belum ada.
    const pmRaw = (ov.produksi || []).find((x) => x.month === ov.month);
    const pm = pmRaw && pmRaw.rows.some((r) => r.selesai != null || r.target != null) ? pmRaw : null;
    if (pm) {
      root.appendChild(table([
        { t: 'Konten', k: (r) => r.konten },
        { t: 'Selesai', k: (r) => fmtNum(r.selesai), cls: 'num' },
        { t: 'Target', k: (r) => fmtNum(r.target), cls: 'num' },
        { t: 'Progres', k: (r) => { const p = r.target ? pct(r.selesai || 0, r.target) : 0; const w = el('div', 'prog'); w.appendChild(bar(p, p >= 100 ? 'ok' : '')); w.appendChild(el('span', null, r.progres || p + '%')); return w; } },
        { t: 'Update', k: (r) => [r.update, r.oleh].filter(Boolean).join(' · ') },
      ], pm.rows));
      root.appendChild(el('div', 'pg-note', 'Sumber: tab REPORT PRODUKSI (diisi manual tim).'));
    } else if (ov.prodErr && /action tidak dikenal/i.test(ov.prodErr.message || '')) {
      root.appendChild(errCard(ov.prodErr));
    } else {
      root.appendChild(el('div', 'pg-note', 'Belum ada blok bulan ini di REPORT PRODUKSI.'));
    }

    const group = (keyFn) => {
      const m = new Map();
      recs.forEach((r) => {
        const keys = keyFn(r); (keys.length ? keys : ['(kosong)']).forEach((key) => {
          if (!m.has(key)) m.set(key, []);
          m.get(key).push(r);
        });
      });
      return Array.from(m.entries()).map(([key, list]) => ({ key, list })).sort((a, b) => b.list.length - a.list.length);
    };
    const platCell = (list, p) => {
      const slots = list.filter((r) => K.platHealth(r, p) !== 'na');
      if (!slots.length) return '—';
      const up = slots.filter((r) => ['Uploaded', 'Scheduled'].includes(r.plat[p].status)).length;
      return `${up}/${slots.length}`;
    };
    const statCols = (label) => [
      { t: label, k: (g) => g.key },
      { t: 'Konten', k: (g) => String(g.list.length), cls: 'num' },
      { t: 'Beres', k: (g) => { const b = g.list.filter((r) => r.production).length; const w = el('div', 'prog'); w.appendChild(bar(pct(b, g.list.length), 'ok')); w.appendChild(el('span', null, `${b}/${g.list.length}`)); return w; } },
      { t: 'Telat', k: (g) => String(g.list.filter((r) => K.rowHealth(r) === 'bad').length), cls: 'num' },
      { t: 'YT', k: (g) => platCell(g.list, 'YT'), cls: 'num' },
      { t: 'IG', k: (g) => platCell(g.list, 'IG'), cls: 'num' },
      { t: 'TT', k: (g) => platCell(g.list, 'TT'), cls: 'num' },
    ];
    root.appendChild(el('h2', 'pg-h2', 'Per jenis konten'));
    root.appendChild(table(statCols('Jenis'), group((r) => (r.jenis ? [r.jenis] : [])), { cls: 'tbl-stat' }));
    root.appendChild(el('h2', 'pg-h2', 'Per akun'));
    root.appendChild(table(statCols('Akun'), group((r) => (r.akun ? [r.akun] : [])), { cls: 'tbl-stat' }));
    root.appendChild(el('h2', 'pg-h2', 'Per producer'));
    root.appendChild(table(statCols('Producer'), group((r) => splitMulti(r.producer)), { cls: 'tbl-stat' }));
    root.appendChild(el('div', 'pg-note', 'YT/IG/TT = Uploaded atau Scheduled / jumlah konten yang punya jam tayang di platform itu.'));
  }

  // =====================================================================
  // LOG POST (INSIGHT)
  // =====================================================================
  const lg = Object.assign({ from: K.shiftDate(K.todayJkt(), -30), to: K.todayJkt(), platform: 'Semua', akun: 'Semua', q: '', all: false, sort: 'baru' },
    lsGet('log_prefs') || {}, { res: lsGet('log_cache'), loading: false, err: null });
  const PLATFORM = ['Semua', 'YouTube', 'Instagram', 'TikTok'];

  async function loadLog(manual) {
    if (lg.loading) return;
    lg.loading = true; lg.err = null; renderLog();
    const p = { action: 'insight' };
    if (!(lg.all && lg.q)) { p.from = lg.from; p.to = lg.to; }
    if (lg.platform !== 'Semua') p.platform = lg.platform;
    if (lg.akun !== 'Semua') p.akun = lg.akun;
    if (lg.q) p.q = lg.q;
    try {
      const res = await K.api('GET', p);
      lg.res = Object.assign(res, { at: Date.now() });
      lsSet('log_cache', lg.res);
      lsSet('log_prefs', { from: lg.from, to: lg.to, platform: lg.platform, akun: lg.akun, q: lg.q, all: lg.all, sort: lg.sort });
      if (manual) K.toast(`${nf.format(res.matched)} postingan ditemukan.`);
    } catch (e) { lg.err = e; }
    finally { lg.loading = false; if (current === 'log') renderLog(); }
  }

  function renderLog() {
    const root = $('pgLog'); root.innerHTML = '';
    root.appendChild(pageHead('Log Post', lg.loading ? 'Memuat dari tab INSIGHT…' : lg.res ? 'Dari tab INSIGHT · update ' + jamWib(new Date(lg.res.at)) + ' WIB' : 'Performa tiap postingan dari tab INSIGHT', () => loadLog(true)));

    const form = el('form', 'pg-ctl log-ctl');
    form.onsubmit = (e) => { e.preventDefault(); lg.q = q.value.trim(); lg.from = f.value || lg.from; lg.to = t.value || lg.to; loadLog(true); };
    const dates = el('div', 'ctl-dates');
    const f = el('input'); f.type = 'date'; f.value = lg.from; f.setAttribute('aria-label', 'Dari tanggal');
    const t = el('input'); t.type = 'date'; t.value = lg.to; t.setAttribute('aria-label', 'Sampai tanggal');
    dates.appendChild(f); dates.appendChild(el('span', null, '–')); dates.appendChild(t);
    const q = el('input', 'ctl-search'); q.type = 'search'; q.placeholder = 'Cari judul, brand, atau post ID'; q.value = lg.q; q.setAttribute('aria-label', 'Cari');
    const all = el('label', 'dash-toggle'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = lg.all;
    cb.onchange = () => { lg.all = cb.checked; }; all.appendChild(cb); all.appendChild(document.createTextNode(' Cari di semua tanggal'));
    const go = el('button', 'btn btn-sm', 'Terapkan'); go.type = 'submit';
    const row1 = el('div', 'ctl-row'); row1.appendChild(dates); row1.appendChild(q); row1.appendChild(go);
    form.appendChild(row1);
    const akunOpts = ['Semua'].concat(((K.options().akun || {}).values || ['SP', 'FP', 'NSP']).filter(Boolean));
    const row2 = el('div', 'ctl-row');
    row2.appendChild(chips(PLATFORM, lg.platform, (v) => { lg.platform = v; loadLog(false); }, 'Platform'));
    row2.appendChild(chips(akunOpts, lg.akun, (v) => { lg.akun = v; loadLog(false); }, 'Akun'));
    row2.appendChild(all);
    form.appendChild(row2);
    root.appendChild(form);

    if (lg.err) root.appendChild(errCard(lg.err));
    const res = lg.res;
    if (!res) { if (!lg.err) root.appendChild(el('div', 'loading-text', 'Memuat…')); return; }

    const k = el('div', 'kpis');
    k.appendChild(kpi('Postingan', nf.format(res.matched), res.truncated ? `tampil ${nf.format(res.rows.length)} terbaru` : ''));
    k.appendChild(kpi('Views', fmtNum(res.total.views)));
    k.appendChild(kpi('Likes', fmtNum(res.total.likes)));
    k.appendChild(kpi('Komentar', fmtNum(res.total.comments)));
    k.appendChild(kpi('Shares', fmtNum(res.total.shares)));
    root.appendChild(k);

    const sortBar = el('div', 'ctl-row');
    sortBar.appendChild(el('span', 'ctl-lab', 'Urutkan'));
    sortBar.appendChild(chips([['baru', 'Terbaru'], ['views', 'Views terbanyak'], ['likes', 'Likes terbanyak']], lg.sort, (v) => { lg.sort = v; lsSet('log_prefs', Object.assign(lsGet('log_prefs') || {}, { sort: v })); renderLog(); }, 'Urutkan'));
    root.appendChild(sortBar);

    let rows = res.rows.slice();
    if (lg.sort !== 'baru') rows.sort((a, b) => (b[lg.sort] || 0) - (a[lg.sort] || 0));
    if (!rows.length) { root.appendChild(el('div', 'coming-soon-card', 'Gak ada postingan yang cocok dengan filter ini.')); return; }
    root.appendChild(table([
      { t: 'Tanggal', k: (r) => (r.date ? dayLabel(r.date) + (r.time ? ' · ' + r.time : '') + (r.dateFromKalender ? ' *' : '') : '—'), cls: 'nowrap' },
      { t: 'Judul', k: (r) => (r.link ? link(r.title, r.link) : r.title), cls: 'grow' },
      { t: 'Platform', k: (r) => r.platform },
      { t: 'Akun', k: (r) => r.akun },
      { t: 'Jenis', k: (r) => r.jenis },
      { t: 'Views', k: (r) => fmtNum(r.views), cls: 'num' },
      { t: 'Likes', k: (r) => fmtNum(r.likes), cls: 'num' },
      { t: 'Komen', k: (r) => fmtNum(r.comments), cls: 'num' },
      { t: 'Share', k: (r) => fmtNum(r.shares), cls: 'num' },
      { t: 'Brand', k: (r) => r.brand },
    ], rows, { cls: 'tbl-log' }));
    if (rows.some((r) => r.dateFromKalender)) root.appendChild(el('div', 'pg-note', '* Tanggal diambil dari KALENDER KONTEN / KALENDER AFFILIATE lewat Post ID, karena kolom Tanggal Upload di INSIGHT kosong.'));
    if (res.truncated) root.appendChild(el('div', 'pg-note', `Ditampilkan ${nf.format(rows.length)} dari ${nf.format(res.matched)} postingan. Persempit tanggal atau pakai pencarian. Total di atas tetap dihitung dari semua.`));
  }

  // =====================================================================
  // BRAND (SOW BRAND DEAL, TIMELINE BEDAH, LIST REPORT BRAND)
  // =====================================================================
  const br = { tab: lsGet('brand_tab') || 'sow', q: '', data: lsGet('brand_cache'), loading: false, err: null };
  async function loadBrand(manual) {
    if (br.loading) return;
    br.loading = true; br.err = null; renderBrand();
    try {
      const res = await K.api('GET', { action: 'brand' });
      br.data = Object.assign(res, { at: Date.now() }); lsSet('brand_cache', br.data);
      if (manual) K.toast('Data brand terbaru udah ditarik.');
    } catch (e) { br.err = e; }
    finally { br.loading = false; if (current === 'brand') renderBrand(); }
  }
  const match = (...vals) => !br.q || vals.join(' ').toLowerCase().includes(br.q.toLowerCase());
  function statusTag(s) {
    const u = String(s || '').toLowerCase();
    const cls = /selesai|diterima|ready|done|lunas/.test(u) ? 'ok' : /pending|proses|menunggu/.test(u) ? 'pend' : /batal|tolak/.test(u) ? 'bad' : '';
    return s ? tag(s, 'st ' + cls) : el('span', 'muted', '—');
  }
  function groupByMonth(rows) {
    const out = [];
    rows.forEach((r) => { let g = out.find((x) => x.month === r.month); if (!g) { g = { month: r.month, rows: [] }; out.push(g); } g.rows.push(r); });
    return out.reverse(); // blok terbaru biasanya paling bawah di sheet
  }

  function renderBrand() {
    const root = $('pgBrand'); root.innerHTML = '';
    const d = br.data;
    root.appendChild(pageHead('Brand', br.loading ? 'Memuat…' : d ? 'Baca saja dari sheet · update ' + jamWib(new Date(d.at)) + ' WIB' : 'Deal, timeline bedah, dan link report brand', () => loadBrand(true)));
    const ctl = el('div', 'pg-ctl ctl-row');
    const n = (k) => (d ? (k === 'bedah' ? d.bedah.rows.length : d[k].length) : 0);
    ctl.appendChild(chips([['sow', `Deal & SOW (${n('sow')})`], ['bedah', `Timeline Bedah (${n('bedah')})`], ['reports', `Link Report (${n('reports')})`]], br.tab,
      (v) => { br.tab = v; lsSet('brand_tab', v); renderBrand(); }, 'Bagian'));
    const q = el('input', 'ctl-search'); q.type = 'search'; q.placeholder = 'Cari brand atau artikel'; q.value = br.q; q.setAttribute('aria-label', 'Cari brand');
    q.oninput = () => { br.q = q.value; const pos = q.selectionStart; renderBrand(); const nq = root.querySelector('.ctl-search'); nq.focus(); nq.setSelectionRange(pos, pos); };
    ctl.appendChild(q);
    root.appendChild(ctl);
    if (br.err) root.appendChild(errCard(br.err));
    if (!d) { if (!br.err) root.appendChild(el('div', 'loading-text', 'Memuat…')); return; }
    if (d.missing && d.missing.length) root.appendChild(el('div', 'pg-note', 'Tab tidak ditemukan di sheet: ' + d.missing.join(', ')));

    if (br.tab === 'sow') {
      const groups = groupByMonth(d.sow.filter((r) => match(r.brand, r.artikel)));
      if (!groups.length) root.appendChild(el('div', 'coming-soon-card', 'Gak ada deal yang cocok.'));
      groups.forEach((g) => {
        root.appendChild(el('h2', 'pg-h2', g.month || 'Tanpa bulan'));
        const sowNames = (g.rows[0] && g.rows[0].sow.map((s) => s.name)) || [];
        const nice = (s) => s.charAt(0) + s.slice(1).toLowerCase();
        root.appendChild(table([
          { t: 'Brand', k: (r) => el('b', null, r.brand) },
          { t: 'Artikel', k: (r) => r.artikel, cls: 'grow' },
          { t: 'Sepatu', k: (r) => r.jumlah, cls: 'num' },
          { t: 'Status', k: (r) => statusTag(r.status) },
        ].concat(sowNames.map((name, i) => ({
          t: nice(name),
          k: (r) => { const s = r.sow[i]; if (!s || (!s.target && !s.status)) return '—'; const w = el('span', 'sow'); w.appendChild(el('b', null, s.target || '·')); if (s.status) w.appendChild(statusTag(s.status)); return w; },
        }))).concat([{ t: 'Keterangan', k: (r) => r.ket }]), g.rows, { cls: 'tbl-sow' }));
      });
    } else if (br.tab === 'bedah') {
      const hs = d.bedah.headers.filter((h) => h !== 'BRAND');
      const groups = groupByMonth(d.bedah.rows.filter((r) => match(r.BRAND, r['NAMA ARTIKEL'])));
      if (!groups.length) root.appendChild(el('div', 'coming-soon-card', 'Gak ada artikel yang cocok.'));
      groups.forEach((g) => {
        root.appendChild(el('h2', 'pg-h2', g.month || 'Tanpa bulan'));
        root.appendChild(table([{ t: 'Brand', k: (r) => el('b', null, r.BRAND) }].concat(hs.map((h) => ({
          t: h.length <= 3 ? h : h.charAt(0) + h.slice(1).toLowerCase(),
          k: (r) => (h === 'STATUS' ? statusTag(r[h]) : r[h]),
          cls: h === 'NAMA ARTIKEL' ? 'grow' : 'nowrap',
        }))), g.rows, { cls: 'tbl-bedah' }));
      });
    } else {
      const rows = d.reports.filter((r) => match(r.brand));
      if (!rows.length) { root.appendChild(el('div', 'coming-soon-card', 'Gak ada brand yang cocok.')); return; }
      const grid = el('div', 'rep-grid');
      rows.forEach((r) => { const a = link(r.brand, r.link); a.className = 'rep-card'; a.appendChild(el('span', 'rep-go', 'Buka report ↗')); grid.appendChild(a); });
      root.appendChild(grid);
    }
  }

  // =====================================================================
  // NAVIGASI
  // =====================================================================
  const PAGES = [
    { id: 'upload', label: 'Upload Harian', page: 'page-dashboard' },
    { id: 'tugas', label: 'Tugas Saya', page: 'page-tugas', render: () => { renderTugas(); const at = K.loadedAt(); if (!at || Date.now() - at.getTime() > 60 * 1000) K.load(false); } },
    { id: 'overview', label: 'Overview', page: 'page-overview', render: () => { renderOverview(); loadOverview(false); } },
    { id: 'log', label: 'Log Post', page: 'page-log', render: () => { renderLog(); if (!lg.res || Date.now() - lg.res.at > 10 * 60 * 1000) loadLog(false); } },
    { id: 'brand', label: 'Brand', page: 'page-brand', render: () => { renderBrand(); if (!br.data || Date.now() - br.data.at > 10 * 60 * 1000) loadBrand(false); } },
  ];
  let current = null;

  function buildNav() {
    const w = $('appNavLinks'); w.innerHTML = '';
    PAGES.forEach((p) => {
      const a = el('a', 'app-nav-link', p.label); a.href = '#/' + p.id; a.dataset.page = p.id;
      w.appendChild(a);
    });
  }
  function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, query] = raw.split('?');
    const pg = PAGES.find((p) => p.id === name) || PAGES[0];
    const changed = current !== pg.id;
    current = pg.id;
    PAGES.forEach((p) => { const e = $(p.page); if (e) e.classList.toggle('active', p === pg); });
    document.querySelectorAll('.app-nav-link').forEach((a) => { if (a.dataset.page === pg.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = pg.label + ' · Dashboard Konten';
    if (pg.id === 'upload') {
      window.renderDashboard();
      if (/(^|&)tambah=1/.test(query || '')) { history.replaceState(null, '', '#/upload'); setTimeout(() => K.openAdd(), 0); }
    } else pg.render();
    if (changed) window.scrollTo(0, 0);
    const act = document.querySelector('.app-nav-link[aria-current]'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  window.goPage = (n) => { location.hash = '#/' + (n === 'dashboard' || n === 'home' ? 'upload' : n); };

  function setOffline() { const b = $('appOffline'); if (b) b.hidden = navigator.onLine; }

  window.startPages = function () {
    buildNav();
    window.addEventListener('hashchange', route);
    route();
    // Data Upload Harian berubah -> halaman yang pakai data itu ikut di-render ulang.
    K.onData(() => { if (current === 'tugas') renderTugas(); });
    // Balik ke tab/app setelah lama ditinggal -> tarik data terbaru.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const at = K.loadedAt();
      if (!at || Date.now() - at.getTime() > 60 * 1000) K.load(false);
    });
    window.addEventListener('online', () => { setOffline(); K.load(false); });
    window.addEventListener('offline', setOffline);
    setOffline();
    // Tombol install (Chrome/Edge/Android). Di iPhone: Share → Add to Home Screen.
    let deferred = null;
    const btn = $('appInstall');
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (btn) btn.hidden = false; });
    if (btn) btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; btn.hidden = true; };
    window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; });
  };
})();
