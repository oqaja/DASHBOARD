# Dashboard Konten

Web app mandiri buat kontrol konten Shoe Police dari tab **KALENDER KONTEN**
(spreadsheet DASHBOARD KULTURAMA V1): status upload YT/IG/TT per hari, beres/belum dari
kolom PRODUCTION, plus detail & edit tiap konten.

- **Terpisah dari app Absensi**: gak pakai login Absensi, gak nyambung ke backend Absensi.
- **Data tersinkron lewat sheet**: baca & tulis langsung ke KALENDER KONTEN, jadi perubahan
  di sheet, di web app ini, dan di tab Dashboard app Absensi semuanya ketemu di data yang sama.
  Web app narik ulang data tiap 3 menit (atau tap ↻).
- **Tanpa login**: siapa pun yang punya link bisa lihat & edit. Jangan sebar link-nya ke luar tim.

## Isi repo

| File | Isi |
|---|---|
| `index.html` | Halaman dashboard + `DASHBOARD_CONFIG.apiUrl` (alamat backend) |
| `dashboard.js` | Logika dashboard (list, ringkasan, detail, edit) |
| `style.css` | Tema pastel "Shoebox Tag" (asal dari app Absensi) |
| `web.css` | Tambahan khusus web app ini |
| `apps-script/dashboard-backend.gs` | Kode backend Apps Script (project sendiri) |

## Pasang backend

1. script.google.com → **New project** (pakai akun Google yang bisa **edit** spreadsheet
   DASHBOARD KULTURAMA V1) → tempel `apps-script/dashboard-backend.gs` → **Save**.
2. **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone** → Deploy.
3. Copy URL `/exec` → isi `apiUrl` di `DASHBOARD_CONFIG` (`index.html`).

Update kode backend: tempel versi baru → **Save** → **Deploy → Manage deployments → ✏️ →
Version: New version → Deploy** (URL tetap sama).

Kolom sheet dibaca lewat **nama header** (TANGGAL, JUDUL KONTEN, CATATAN, dst.), jadi kolom
boleh ditambah/dihapus/dipindah asal nama header-nya gak diganti.
