# Bimbel App

PWA internal bimbel dengan **akses per modul** (Lihat/Kelola per akun, bukan per role): data siswa + asesmen ABK (privat), tentor & tarif, jadwal dengan **absen foto kamera + GPS**, laporan perkembangan (PDF), bank materi, dan **invoice semi-otomatis** dengan nota PDF.

**Stack:** Next.js 16 (`output: 'standalone'`) · PostgreSQL + Drizzle ORM · sesi login sendiri (cookie httpOnly, `scrypt`) · file di disk lokal (`UPLOAD_DIR`) · Tailwind + shadcn/ui · Docker + GitHub Actions + Caddy.

## Jalankan lokal

```bash
pnpm install
pnpm db:up       # Postgres lokal via docker-compose.dev.yml (port 5433)
pnpm db:reset    # migrasi + data demo (hanya DB lokal)
pnpm dev         # http://localhost:3000
```

Akun demo (password `Demo12345!`): `superadmin@bimbel.test`, `admin@bimbel.test`, `aulia@bimbel.test` / `dimas@bimbel.test` / `rina@bimbel.test` (tentor), `bayu@bimbel.test` (admin + tentor).

Uji otorisasi & keamanan file: `pnpm test:authz` (tambah `BASE_URL=http://localhost:3000` untuk uji HTTP). Uji konversi data role → akses per modul: `pnpm test:migrasi` (butuh `TEST_DATABASE_URL` ke DB lokal terpisah).

## Deploy

`git push main` → GitHub Actions build image → GHCR → SSH ke VPS → `docker compose up -d`.

- Build **tidak** menyentuh database; migrasi Drizzle jalan otomatis saat container start.
- Di VPS: salin `docker-compose.yml` ke `/srv/<app>/`, buat `.env` (lihat `.env.example`), lalu siapkan folder upload:
  ```bash
  sudo mkdir -p /srv/files/<APP_NAME> && sudo chown 1001:1001 /srv/files/<APP_NAME>
  ```
  Folder ini di-mount ke `/app/uploads`. Backup bersama dump Postgres.
- Super Admin pertama: isi `BOOTSTRAP_SUPERADMIN_EMAIL` & `BOOTSTRAP_SUPERADMIN_PASSWORD` (min. 12 karakter) di `.env`, hapus password setelah login.
- GitHub: secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; variable `APP_DIR`.

## Keamanan

Otorisasi seluruhnya di kode server (`src/server/services/*`, `src/server/authz.ts`, daftar modul di `src/lib/access.ts`). Tiap akun punya level **Tidak ada / Lihat / Kelola** per modul (Siswa, Asesmen, Tentor & Tarif, Jadwal, Laporan, Materi, Invoice, Pengaturan, Pengguna), plus centang **Mengajar** (absen & laporan untuk siswanya sendiri) dan **Super Admin** (akses penuh, tersembunyi dari pengelola akun lain). Pengelola akun tidak bisa memberi akses melebihi aksesnya sendiri; pembuat/pengubah data tercatat (`created_by`/`updated_by`). File privat disajikan lewat `/api/files/[id]` setelah cek izin (streaming, `nosniff`); upload divalidasi tipe (magic bytes) & ukuran, nama di disk UUID acak.

## Struktur

```
src/db/schema.ts         skema Drizzle      drizzle/         migrasi SQL
src/server/services/     logika + otorisasi src/lib/storage.ts  saveFile/getFile/deleteFile
src/app/api/             upload & file      scripts/         seed, reset, uji, migrasi file Supabase
```
