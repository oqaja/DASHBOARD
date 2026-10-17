# Dashboard Konten

Web app buat kontrol konten Shoe Police dari tab **KALENDER KONTEN** (DASHBOARD KULTURAMA V1):
status upload YT/IG/TT per hari, beres/belum dari kolom PRODUCTION, plus detail & edit tiap konten.

Ini salinan berdiri sendiri dari tab **Dashboard** di app Absensi (`hrKulturama/ABSENSI`).

## Isi repo

| File | Isi |
|---|---|
| `index.html` | Halaman login + dashboard |
| `auth.js` | Login pakai nama + PIN Absensi (khusus role kreatif / hr / admin) |
| `dashboard.js` | Logika dashboard — **salinan persis** `dashboard.js` di repo ABSENSI |
| `style.css` | Salinan `style.css` app Absensi (tema pastel "Shoebox Tag") |
| `web.css` | Tambahan khusus web app ini (bar user, form login) |
| `apps-script/kontrol-upload.gs` | Kode backend Apps Script "Kontrol Dashboard" (sama dengan di repo ABSENSI) |

## Backend

- **Data**: Apps Script "Kontrol Dashboard" — URL-nya di `KONTROL_API_URL` (`dashboard.js`).
  Satu backend dipakai bareng app Absensi dan web app ini. Kolom dibaca lewat **nama header**,
  jadi kolom sheet boleh ditambah/dihapus/dipindah asal nama header-nya gak diganti.
- **Login**: backend Absensi (`action: 'login'`), URL-nya di `ABSENSI_SCRIPT_URL` (`auth.js`).
  Token yang dihasilkan diverifikasi Kontrol Dashboard pakai `HR_TOKEN_SECRET` yang sama.

Update kode backend: tempel `apps-script/kontrol-upload.gs` ke project Apps Script, **Save**, lalu
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (URL tetap sama).

## Sinkron dengan app Absensi

`dashboard.js` dan `style.css` di sini disalin dari repo ABSENSI. Kalau salah satu diubah,
salin juga ke repo satunya biar dua-duanya tetap sama.
