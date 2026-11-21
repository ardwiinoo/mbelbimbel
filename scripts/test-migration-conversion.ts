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

  await client.end();
  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
