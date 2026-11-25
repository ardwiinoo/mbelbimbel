// Simulasi upgrade DB produksi: skema lama (migrasi 0000–0001, kolom `role`) → migrasi terbaru.
// Memastikan konversi role → akses per modul TIDAK mengubah hak akses akun yang ada.
// Pakai DB terpisah (TEST_DATABASE_URL), BUKAN DB utama:
//   TEST_DATABASE_URL=postgresql://bimbel:bimbel@127.0.0.1:5433/bimbel_conv pnpm tsx scripts/test-migration-conversion.ts
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("Set TEST_DATABASE_URL ke DB lokal khusus uji");

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, d = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${ok ? "" : "  " + d}`);
};

async function main() {
  // buat ulang DB uji
  const admin = new URL(url!);
  const dbName = admin.pathname.slice(1);
  admin.pathname = "/postgres";
  const root = new Client({ connectionString: admin.toString() });
  await root.connect();
  await root.query(`drop database if exists "${dbName}" with (force)`);
  await root.query(`create database "${dbName}"`);
  await root.end();

  const client = new Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client);

  // 1) Terapkan HANYA migrasi lama (keadaan produksi sebelum fitur ini)
  const oldDir = mkdtempSync(path.join(tmpdir(), "mig-old-"));
  cpSync("drizzle", oldDir, { recursive: true });
  const journalPath = path.join(oldDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => /^000[01]_/.test(e.tag));
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: oldDir });
  rmSync(oldDir, { recursive: true, force: true });
  console.log("Skema lama siap (0000–0001).");

  // 2) Data lama ala produksi
  await client.query(`
    insert into users (id, email, password_hash, nama, role) values
      ('00000000-0000-0000-0000-000000000001','owner@x.test','h','Owner','super_admin'),
      ('00000000-0000-0000-0000-000000000002','admin@x.test','h','Admin','admin'),
      ('00000000-0000-0000-0000-000000000003','tentor@x.test','h','Tentor','tentor'),
      ('00000000-0000-0000-0000-000000000004','off@x.test','h','Nonaktif','tentor');
    update users set status = 'nonaktif' where email = 'off@x.test';
    insert into students (id, nama) values ('10000000-0000-0000-0000-000000000001','Siswa Lama');
    update users set spesialisasi = 'Calistung, SD Umum' where email = 'tentor@x.test';
    update users set spesialisasi = 'Fisika, Matematika SMP' where email = 'off@x.test';
    update users set spesialisasi = 'Seni Musik' where email = 'admin@x.test';
    insert into programs (nama, kategori, jenjang, tarif_per_pertemuan) values
      ('Privat Calistung','privat','SD',60000), ('ABK Calistung','abk','SD',100000), ('Kelompok Fisika','kelompok','SMP',50000),
      ('Privat Bahasa Inggris','privat','SMP',70000), ('Privat TKA SD','privat','6 SD',75000), ('Les Kimia SMA','privat','SMA',80000),
      ('Privat Menggambar','privat','SD',50000);
  `);

  // 3) Upgrade ke migrasi terbaru (yang akan jalan otomatis saat container start)
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Upgrade ke migrasi terbaru selesai.\n");

  const users = (await client.query(`select email, is_superuser, is_tutor, status from users order by email`)).rows;
  const perms = (await client.query(`select u.email, p.module, p.level from user_permissions p join users u on u.id = p.user_id order by 1, 2`)).rows;
  const permOf = (email: string) => Object.fromEntries(perms.filter((p) => p.email === email).map((p) => [p.module, p.level]));
  const u = (email: string) => users.find((x) => x.email === email);

  check("super_admin → is_superuser", u("owner@x.test")?.is_superuser === true && !u("owner@x.test")?.is_tutor);
  const a = permOf("admin@x.test");
  check(
    "admin → Kelola 8 modul operasional",
    ["siswa", "asesmen", "tentor", "jadwal", "laporan", "materi", "invoice", "pengaturan"].every((m) => a[m] === "write"),
    JSON.stringify(a),
  );
  check("admin TIDAK dapat akses Pengguna (sama seperti dulu)", !("pengguna" in a));
  check("admin bukan Super Admin & bukan tentor", !u("admin@x.test")?.is_superuser && !u("admin@x.test")?.is_tutor);
  check("tentor → Mengajar + Lihat Bank Materi", u("tentor@x.test")?.is_tutor === true && JSON.stringify(permOf("tentor@x.test")) === '{"materi":"read"}');
  check("status nonaktif tetap nonaktif", u("off@x.test")?.status === "nonaktif" && u("off@x.test")?.is_tutor === true);
  const cols = (await client.query(`select column_name from information_schema.columns where table_name = 'users'`)).rows.map((r) => r.column_name);
  check("kolom role lama sudah dihapus", !cols.includes("role"));
  check("kolom jejak created_by/updated_by ada", cols.includes("created_by") && cols.includes("updated_by"));
  const st = (await client.query(`select nama, created_by from students`)).rows;
  check("data lama tetap utuh (jejak lama = null)", st.length === 1 && st[0].nama === "Siswa Lama" && st[0].created_by === null);

  // Migrasi 0004: kelompok mapel ditebak dari data lama
  const pm = Object.fromEntries((await client.query("select nama, mapel_kategori from programs")).rows.map((r) => [r.nama, r.mapel_kategori]));
  check("program: kategori ABK → abk (menang atas kata 'Calistung')", pm["ABK Calistung"] === "abk", JSON.stringify(pm));
  check(
    "program: nama → calistung/fisika_ipa/bahasa/tematik/kimia_biologi",
    pm["Privat Calistung"] === "calistung" && pm["Kelompok Fisika"] === "fisika_ipa" && pm["Privat Bahasa Inggris"] === "bahasa" && pm["Privat TKA SD"] === "tematik" && pm["Les Kimia SMA"] === "kimia_biologi",
    JSON.stringify(pm),
  );
  check("program: tidak dikenal → lainnya (tidak error)", pm["Privat Menggambar"] === "lainnya");
  const um = Object.fromEntries((await client.query("select email, mapel_kategori from users")).rows.map((r) => [r.email, r.mapel_kategori]));
  check("tentor: spesialisasi → mapel (Calistung→calistung, Fisika+Matematika→fisika_ipa)", um["tentor@x.test"] === "calistung" && um["off@x.test"] === "fisika_ipa", JSON.stringify(um));
  check("non-tentor tidak diberi mapel (null)", um["admin@x.test"] === null && um["owner@x.test"] === null, JSON.stringify(um));

  // Migrasi 0005: kolom/tabel baru tidak boleh mengubah data lama
  const colsOf = async (c: Client, table: string) => (await c.query("select column_name from information_schema.columns where table_name = $1", [table])).rows.map((r) => r.column_name as string);
  const uCols = await colsOf(client, "users");
  check("0005: users.tarif_honor & rekening ada", uCols.includes("tarif_honor") && uCols.includes("rekening"));
  check("0005: semua tentor lama mendapat tarif_honor 0 (belum diisi) & rekening kosong", (await client.query("select count(*)::int n from users where tarif_honor <> 0 or rekening is not null")).rows[0].n === 0);
  check("0005: app_settings.absen_susulan_bebas default FALSE (perilaku lama)", (await client.query("select count(*)::int n from app_settings where absen_susulan_bebas")).rows[0].n === 0);
  check("0005: admin yang mengelola Invoice otomatis mendapat Honor Tentor (Kelola)", permOf("admin@x.test").honor === "write", JSON.stringify(permOf("admin@x.test")));
  check("0005: tentor TIDAK mendapat akses Honor", !("honor" in permOf("tentor@x.test")));
  const tbls = (await client.query("select table_name from information_schema.tables where table_schema = 'public'")).rows.map((r) => r.table_name as string);
  check("0005: tabel honor_slips, honor_counters & tutor_honor_rates ada", ["honor_slips", "honor_counters", "tutor_honor_rates"].every((t) => tbls.includes(t)));
  const kinds = (await client.query("select unnest(enum_range(null::file_kind))::text k")).rows.map((r) => r.k as string);
  check("0005: jenis file 'signature' & 'logo' tersedia, jenis lama utuh", ["assessment", "attendance", "report", "material", "signature", "logo"].every((k) => kinds.includes(k)), kinds.join(","));
  const sCols = await colsOf(client, "sessions");
  const stCols = await colsOf(client, "students");
  const setCols = await colsOf(client, "app_settings");
  check("0005: kolom baru sesi (honor_slip_id, honor_tarif), siswa (panggilan), pengaturan (logo/tagline/kota/absen susulan), user (ttd)",
    sCols.includes("honor_slip_id") && sCols.includes("honor_tarif") && stCols.includes("panggilan") && ["logo_file_id", "tagline", "kota", "absen_susulan_bebas"].every((x) => setCols.includes(x)) && uCols.includes("ttd_file_id"));

  // ===== Skenario B: produksi yang sudah di migrasi 0003 → upgrade ke migrasi terbaru =====
  console.log("\nSkenario B: DB di migrasi 0003 (kondisi produksi sekarang) berisi data → upgrade (data produksi harus utuh)");
  const bName = `${dbName}_b`;
  {
    const root2 = new Client({ connectionString: admin.toString() });
    await root2.connect();
    await root2.query(`drop database if exists "${bName}" with (force)`);
    await root2.query(`create database "${bName}"`);
    await root2.end();
    const bUrl = new URL(url!);
    bUrl.pathname = `/${bName}`;
    const cb = new Client({ connectionString: bUrl.toString() });
    await cb.connect();
    const dbb = drizzle(cb);

    const upTo4 = mkdtempSync(path.join(tmpdir(), "mig-04-"));
    cpSync("drizzle", upTo4, { recursive: true });
    const jp = path.join(upTo4, "meta", "_journal.json");
    const jr = JSON.parse(readFileSync(jp, "utf8"));
    jr.entries = jr.entries.filter((e: { tag: string }) => /^000[0-3]_/.test(e.tag));
    writeFileSync(jp, JSON.stringify(jr));
    await migrate(dbb, { migrationsFolder: upTo4 });
    rmSync(upTo4, { recursive: true, force: true });
    console.log("Skema produksi saat ini siap (0000–0003).");

    // data ala produksi: akun, program, siswa, jadwal (hadir/terjadwal/batal), invoice lunas & belum, pengaturan kustom
    await cb.query(`
      insert into users (id, email, password_hash, nama, is_tutor, is_superuser, spesialisasi, no_wa) values
        ('00000000-0000-0000-0000-0000000000a1','owner@p.test','h','Owner',false,true,null,null),
        ('00000000-0000-0000-0000-0000000000a2','admin@p.test','h','Admin',false,false,null,'0811'),
        ('00000000-0000-0000-0000-0000000000a3','keu@p.test','h','Keuangan Lihat',false,false,null,null),
        ('00000000-0000-0000-0000-0000000000a4','tentor1@p.test','h','Tentor Satu',true,false,'Calistung','0812'),
        ('00000000-0000-0000-0000-0000000000a5','tentor2@p.test','h','Tentor Dua',true,false,'Fisika','0813');
      insert into user_permissions (user_id, module, level) values
        ('00000000-0000-0000-0000-0000000000a2','invoice','write'),('00000000-0000-0000-0000-0000000000a2','siswa','write'),
        ('00000000-0000-0000-0000-0000000000a2','jadwal','write'),('00000000-0000-0000-0000-0000000000a2','pengaturan','write'),
        ('00000000-0000-0000-0000-0000000000a3','invoice','read'),
        ('00000000-0000-0000-0000-0000000000a4','materi','read'),('00000000-0000-0000-0000-0000000000a5','materi','read');
      insert into programs (id, nama, kategori, jenjang, tarif_per_pertemuan) values
        ('20000000-0000-0000-0000-000000000001','Privat Calistung','privat','SD',60000),
        ('20000000-0000-0000-0000-000000000002','Kelompok Fisika','kelompok','SMP',50000);
      insert into students (id, nama, kelas, sekolah, alamat, ortu_nama, ortu_wa, tanggal_lahir) values
        ('10000000-0000-0000-0000-000000000001','Said','TK B','TK Pertiwi','Jl. Mawar 1','Bu Ani','0811111','2019-05-01'),
        ('10000000-0000-0000-0000-000000000002','Dina','Kelas 8 SMP','SMPN 2','Jl. Melati 2','Pak Budi','0822222','2012-02-02');
      insert into student_programs (student_id, program_id, tutor_id) values
        ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4'),
        ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a5');
      insert into invoices (id, nomor, student_id, program_id, jumlah_sesi, total, status_bayar, tgl_bayar, updated_by, updated_at) values
        ('30000000-0000-0000-0000-000000000001','INV/2026/10/01','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,120000,'lunas','2026-10-20','00000000-0000-0000-0000-0000000000a2','2026-10-20T10:00:00+07'),
        ('30000000-0000-0000-0000-000000000002','INV/2026/11/01','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',1,50000,'belum_lunas',null,null,null);
      insert into sessions (id, student_id, program_id, tutor_id, mulai_at, selesai_at, status_kehadiran, status_tagihan, invoice_id, absen_at) values
        ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4','2026-10-05T09:00:00+07','2026-10-05T10:00:00+07','hadir','terekap','30000000-0000-0000-0000-000000000001','2026-10-05T09:01:00+07'),
        ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4','2026-10-12T09:00:00+07','2026-10-12T10:00:00+07','hadir','terekap','30000000-0000-0000-0000-000000000001','2026-10-12T09:02:00+07'),
        ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a5','2026-11-03T16:00:00+07','2026-11-03T17:00:00+07','hadir','terekap','30000000-0000-0000-0000-000000000002','2026-11-03T16:03:00+07'),
        ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a5','2026-11-10T16:00:00+07','2026-11-10T17:00:00+07','hadir','belum_rekap',null,'2026-11-10T16:02:00+07'),
        ('40000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4','2026-11-17T09:00:00+07','2026-11-17T10:00:00+07','batal','belum_rekap',null,null),
        ('40000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4','2026-12-01T09:00:00+07','2026-12-01T10:00:00+07','terjadwal','belum_rekap',null,null);
      insert into app_settings (id, nama_bimbel, rekening, absen_buka_menit, absen_tutup_menit) values (1,'Bimbel Prod','BCA 123 a.n. Bimbel',45,90)
        on conflict (id) do update set nama_bimbel = excluded.nama_bimbel, rekening = excluded.rekening, absen_buka_menit = 45, absen_tutup_menit = 90;
    `);

    // sidik jari kolom LAMA sebelum upgrade
    const tables = ["users", "user_permissions", "students", "programs", "student_programs", "sessions", "invoices", "app_settings"];
    const count = async (t: string) => (await cb.query(`select count(*)::int n from ${t}`)).rows[0].n as number;
    const countAll = async () => {
      const o: Record<string, number> = {};
      for (const t of tables) o[t] = await count(t); // berurutan: satu koneksi, satu query pada satu waktu
      return o;
    };
    const before = await countAll();
    const fp = async () => ({
      users: (await cb.query(`select md5(string_agg(concat_ws('|', id, email, nama, status, is_tutor, is_superuser, spesialisasi, no_wa, password_hash), ',' order by id)) h from users`)).rows[0].h,
      students: (await cb.query(`select md5(string_agg(concat_ws('|', id, nama, kelas, sekolah, alamat, ortu_nama, ortu_wa, tanggal_lahir, status), ',' order by id)) h from students`)).rows[0].h,
      programs: (await cb.query(`select md5(string_agg(concat_ws('|', id, nama, kategori, jenjang, tarif_per_pertemuan, aktif), ',' order by id)) h from programs`)).rows[0].h,
      sessions: (await cb.query(`select md5(string_agg(concat_ws('|', id, student_id, program_id, tutor_id, mulai_at, selesai_at, status_kehadiran, status_tagihan, invoice_id, absen_at), ',' order by id)) h from sessions`)).rows[0].h,
      invoices: (await cb.query(`select md5(string_agg(concat_ws('|', id, nomor, student_id, program_id, jumlah_sesi, total, status_bayar, tgl_bayar), ',' order by id)) h from invoices`)).rows[0].h,
      perms: (await cb.query(`select md5(string_agg(concat_ws('|', user_id, module, level), ',' order by user_id, module)) h from user_permissions where module <> 'honor'`)).rows[0].h,
      settings: (await cb.query(`select concat_ws('|', nama_bimbel, rekening, absen_buka_menit, absen_tutup_menit) h from app_settings where id = 1`)).rows[0].h,
    });
    const fpBefore = await fp();

    await migrate(dbb, { migrationsFolder: "drizzle" }); // migrasi terbaru, persis seperti saat container start
    console.log("Upgrade 0003 → terbaru selesai.\n");

    const after = await countAll();
    const diffTables = tables.filter((t) => t !== "user_permissions" && before[t] !== after[t]);
    check("upgrade: jumlah baris semua tabel lama TIDAK berubah", diffTables.length === 0, JSON.stringify({ before, after }));
    const fpAfter = await fp();
    for (const k of Object.keys(fpBefore) as (keyof typeof fpBefore)[]) {
      check(`upgrade: isi data lama utuh — ${k} (sidik jari kolom lama sama)`, fpBefore[k] === fpAfter[k]);
    }
    check("upgrade: pengaturan kustom (jendela absen 45/90) tidak ter-reset", fpAfter.settings === "Bimbel Prod|BCA 123 a.n. Bimbel|45|90");
    const pb = (await cb.query(`select u.email, p.module, p.level from user_permissions p join users u on u.id = p.user_id where p.module = 'honor' order by 1`)).rows;
    check("upgrade: hanya admin yang mengelola Invoice mendapat Honor (tentor & staf lihat-saja tidak)", pb.length === 1 && pb[0].email === "admin@p.test" && pb[0].level === "write", JSON.stringify(pb));
    const pmap = Object.fromEntries((await cb.query("select nama, mapel_kategori from programs")).rows.map((r) => [r.nama, r.mapel_kategori]));
    const umap = Object.fromEntries((await cb.query("select email, mapel_kategori from users")).rows.map((r) => [r.email, r.mapel_kategori]));
    check("upgrade: kategori mapel program & tentor lama ditebak dari data (Calistung / Fisika), tanpa error",
      pmap["Privat Calistung"] === "calistung" && pmap["Kelompok Fisika"] === "fisika_ipa" && umap["tentor1@p.test"] === "calistung" && umap["tentor2@p.test"] === "fisika_ipa" && umap["admin@p.test"] === null, JSON.stringify([pmap, umap]));
    const cat = (await cb.query("select key from mapel_categories")).rows.map((r) => r.key as string);
    check("upgrade: 8 kategori mapel awal tersedia termasuk cadangan 'lainnya'", cat.length === 8 && cat.includes("lainnya") && cat.includes("abk"), cat.join());
    const invs = (await cb.query("select nomor, dibayar_oleh, dibayar_pada from invoices order by nomor")).rows;
    check("upgrade: pelaku pelunasan invoice lama diisi dari jejak yang ada; invoice belum lunas tetap kosong (tidak mengarang pelaku)",
      invs[0].dibayar_oleh === "00000000-0000-0000-0000-0000000000a2" && invs[0].dibayar_pada !== null && invs[1].dibayar_oleh === null && invs[1].dibayar_pada === null, JSON.stringify(invs));
    const hsCols = await colsOf(cb, "honor_slips");
    check("upgrade: kolom pelacak honor (dibayar_oleh/pada, tunjangan_oleh/pada) ada", ["dibayar_oleh", "dibayar_pada", "tunjangan_oleh", "tunjangan_pada"].every((x) => hsCols.includes(x)));
    const stv = (await cb.query("select unnest(enum_range(null::status_tagihan))::text as v")).rows.map((r) => r.v as string);
    check("upgrade: status tagihan 'dibebaskan' tersedia, nilai lama utuh", stv.join() === "belum_rekap,terekap,dibebaskan", stv.join());
    check("upgrade: sesi lama tidak terkunci honor (honor_slip_id kosong)", (await cb.query("select count(*)::int n from sessions where honor_slip_id is not null")).rows[0].n === 0);
    const nb = (await cb.query("select (select count(*)::int from users where tarif_honor <> 0) a, (select count(*)::int from students where panggilan is not null) b, (select count(*)::int from app_settings where absen_susulan_bebas) c")).rows[0];
    check("upgrade: tarif honor tentor lama = 0, panggilan siswa lama kosong, absen susulan mati (perilaku lama)", nb.a === 0 && nb.b === 0 && nb.c === 0, JSON.stringify(nb));

    // migrasi bisa diulang (idempoten) & pernyataan pemberian akses aman dijalankan ulang
    await migrate(dbb, { migrationsFolder: "drizzle" });
    await cb.query(`INSERT INTO "user_permissions" ("user_id","module","level") SELECT "user_id",'honor','write' FROM "user_permissions" WHERE "module"='invoice' AND "level"='write' ON CONFLICT ("user_id","module") DO NOTHING`);
    check("upgrade: dijalankan ulang tidak menggandakan data/akses", (await cb.query("select count(*)::int n from user_permissions where module = 'honor'")).rows[0].n === 1 && (await count("users")) === before.users);

    // fitur baru langsung bisa dipakai di atas data lama
    await cb.query(`update users set tarif_honor = 40000, rekening = 'BCA 1' where email = 'tentor1@p.test'`);
    await cb.query(`insert into honor_slips (nomor, periode, tutor_id, total_sesi, subtotal, total) values ('SLIP/2026/10/001','2026-10','00000000-0000-0000-0000-0000000000a4',2,80000,80000)`);
    await cb.query(`update sessions set honor_slip_id = (select id from honor_slips limit 1), honor_tarif = 40000 where id in ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002')`);
    await cb.query(`insert into tutor_honor_rates (tutor_id, mapel_kategori, tarif) values ('00000000-0000-0000-0000-0000000000a4','abk',55000)`);
    await cb.query(`insert into files (kind, storage_key, original_name, mime, size) values ('signature','signature/2026/11/x.png','ttd.png','image/png',10)`);
    check("upgrade: tabel honor baru bisa dipakai di atas data lama", (await cb.query("select count(*)::int n from sessions where honor_slip_id is not null")).rows[0].n === 2);
    let constraintHeld = false;
    try {
      await cb.query(`insert into honor_slips (nomor, periode, tutor_id, total_sesi, subtotal, total) values ('SLIP/DUP','2026-10','00000000-0000-0000-0000-0000000000a4',1,1,1)`);
    } catch {
      constraintHeld = true;
    }
    check("upgrade: satu slip per tentor per bulan ditegakkan database (unik)", constraintHeld);

    // kategori mapel dinamis: bisa ditambah, dirujuk (kunci asing), dan format warna dijaga database
    await cb.query(`insert into mapel_categories (key, label, short, bg, dot) values ('mtk_sma','Matematika SMA','Mtk SMA','#E0E7FF','#4F46E5')`);
    await cb.query(`update programs set mapel_kategori = 'mtk_sma' where nama = 'Privat Calistung'`);
    let fkHeld = false;
    try {
      await cb.query(`delete from mapel_categories where key = 'mtk_sma'`);
    } catch {
      fkHeld = true;
    }
    check("upgrade: kategori mapel baru bisa dipakai & dilindungi kunci asing (tidak bisa dihapus selagi dipakai)", fkHeld);
    let badHex = false;
    try {
      await cb.query(`insert into mapel_categories (key, label, short, bg, dot) values ('x1','X','X','merah','#000000')`);
    } catch {
      badHex = true;
    }
    check("upgrade: database menolak warna kategori yang bukan #RRGGBB", badHex);
    let badRef = false;
    try {
      await cb.query(`update programs set mapel_kategori = 'tidak_ada' where nama = 'Privat Calistung'`);
    } catch {
      badRef = true;
    }
    check("upgrade: database menolak program dengan kategori mapel yang tidak ada", badRef);
    await cb.end();
  }


  await client.end();
  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
