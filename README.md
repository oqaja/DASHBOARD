# Dashboard Konten

PWA mandiri buat kontrol konten Shoe Police dari spreadsheet **DASHBOARD KULTURAMA V1**.
Bisa di-install di HP dan laptop (Chrome/Edge: tombol **Install app** di kanan atas;
iPhone: Share → Add to Home Screen).

| Halaman | Isi | Sumber |
|---|---|---|
| **Upload Harian** | Konten per tanggal, status YT/IG/TT, detail & edit, **tambah konten baru** | KALENDER KONTEN (baca + tulis) |
| **Tugas Saya** | Kanban per orang (Writing → Shooting → Produksi → Beres) | KALENDER KONTEN |
| **Overview** | Ringkasan sebulan per jenis, akun, producer + target bulanan | KALENDER KONTEN, REPORT PRODUKSI |
| **Log Post** | Performa tiap postingan, filter tanggal/platform/akun, cari judul | INSIGHT (baca saja) |
| **Brand** | Deal & SOW, Timeline Bedah, Link Report | SOW BRAND DEAL, TIMELINE BEDAH, LIST REPORT BRAND (baca saja) |

- **Terpisah dari app Absensi**: gak pakai login Absensi, gak nyambung ke backend Absensi.
- **Data tersinkron lewat sheet**: perubahan di sheet, di web app ini, dan di tab Dashboard
  app Absensi semuanya ketemu di data yang sama. Web app narik ulang data tiap 3 menit
  (atau tap ↻), dan tiap kali app dibuka lagi.
- **Cepat dibuka**: data terakhir disimpan di browser, jadi langsung tampil lalu
  diperbarui di belakang. Kalau offline, yang tampil data tersimpan terakhir.
- **Tanpa login**: siapa pun yang punya link bisa lihat & edit. Jangan sebar link-nya ke luar tim.

## Isi repo

| File | Isi |
|---|---|
| `index.html` | Kerangka app + `DASHBOARD_CONFIG.apiUrl` (alamat backend) |
| `dashboard.js` | Halaman Upload Harian (list, ringkasan, detail, edit, tambah konten) + cache data |
| `pages.js` | Navigasi + halaman Tugas Saya, Overview, Log Post, Brand |
| `app.css` | Tema minimalis ala Notion (terang/gelap otomatis) untuk HP, tablet, dan desktop |
| `manifest.json`, `sw.js` | PWA: bisa di-install, tampilan tetap kebuka saat offline |
| `apps-script/dashboard-backend.gs` | Kode backend Apps Script (project sendiri) |

## Pasang backend

1. script.google.com → **New project** (pakai akun Google yang bisa **edit** spreadsheet
   DASHBOARD KULTURAMA V1) → tempel `apps-script/dashboard-backend.gs` → **Save**.
2. **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone** → Deploy.
3. Copy URL `/exec` → isi `apiUrl` di `DASHBOARD_CONFIG` (`index.html`).

Update kode backend: tempel versi baru → **Save** → **Deploy → Manage deployments → ✏️ →
Version: New version → Deploy** (URL tetap sama).

> Fitur **Tambah konten**, **Overview (target)**, **Log Post**, dan **Brand** butuh backend
> versi 2. Kalau backend belum di-update, halaman itu menampilkan pesan "Backend perlu
> di-deploy ulang"; Upload Harian tetap jalan seperti biasa.

Kolom sheet dibaca lewat **nama header** (TANGGAL, JUDUL KONTEN, CATATAN, dst.), jadi kolom
boleh ditambah/dihapus/dipindah asal nama header-nya gak diganti. Konten baru ditambahkan di
bawah baris terakhir KALENDER KONTEN, dengan format & dropdown disalin dari baris di atasnya.
Post ID dan Event ID gak bisa diisi dari form (diisi script upload / Calendar Sync).
