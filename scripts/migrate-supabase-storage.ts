/**
 * Migrasi file lama dari Supabase Storage ke penyimpanan baru (lib/storage.ts).
 * TIDAK dijalankan otomatis. Default DRY-RUN (hanya laporan); tulis sungguhan
 * dengan flag --apply.
 *
 *   OLD_DATABASE_URL=postgresql://...supabase...   (DB Supabase lama, baca saja)
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...                  (hanya untuk mengunduh file)
 *   DATABASE_URL=postgresql://...                  (DB baru)
 *   UPLOAD_DIR=/app/uploads
 *   pnpm tsx scripts/migrate-supabase-storage.ts            # dry-run
 *   pnpm tsx scripts/migrate-supabase-storage.ts --apply    # eksekusi
 *
 * Prasyarat: baris inti (users, students, programs, sessions, dll.) sudah
 * dipindahkan ke DB baru dengan UUID yang SAMA. Script ini menangani bagian file:
 *   - assessments/<path>  → files + student_assessments (insert, id sama)
 *   - reports/<path>      → files + progress_reports    (insert, id sama)
 *   - materials/<path>    → files + materials           (insert, id sama)
 *   - attendance/<path>   → files + sessions.foto_file_id (update)
 * Idempoten: file yang sudah dimigrasi dikenali lewat files.legacy_key ("bucket/path").
 * Password akun Supabase (bcrypt) TIDAK ikut; reset password lewat menu Pengguna.
 */
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { closeDb, db } from "../src/db";
import { files, materials, progressReports, sessions, studentAssessments, students, users } from "../src/db/schema";
import { deleteFile, saveFile } from "../src/lib/storage";
import { validateUpload, type FileKind } from "../src/server/file-rules";

const APPLY = process.argv.includes("--apply");
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Env ${k} wajib di-set`);
  return v;
};

type Item = {
  bucket: "assessments" | "reports" | "materials" | "attendance";
  kind: FileKind;
  path: string;
  name: string;
  /** simpan relasi setelah file tersimpan; kembalikan false bila dilewati */
  link: (fileId: string) => Promise<boolean>;
  describe: string;
};

const exists = async (table: typeof students | typeof users, id: string | null) =>
  !!id && (await db().select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1)).length > 0;

async function download(bucket: string, path: string) {
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
  if (!res.ok) throw new Error(`unduh gagal HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const old = new Pool({ connectionString: env("OLD_DATABASE_URL"), max: 2 });
  env("DATABASE_URL");
  const items: Item[] = [];

  const asm = await old.query(`select id, student_id, file_path, file_name, uploaded_by, uploaded_at from public.student_assessments`);
  for (const r of asm.rows) {
    items.push({
      bucket: "assessments", kind: "assessment", path: r.file_path, name: r.file_name ?? r.file_path.split("/").pop(),
      describe: `asesmen ${r.id}`,
      link: async (fileId) => {
        if (!(await exists(students, r.student_id))) return false;
        await db().insert(studentAssessments).values({
          id: r.id, studentId: r.student_id, fileId,
          uploadedBy: (await exists(users, r.uploaded_by)) ? r.uploaded_by : null, uploadedAt: r.uploaded_at,
        }).onConflictDoNothing();
        return true;
      },
    });
  }

  const rep = await old.query(`select id, student_id, program_id, tutor_id, file_path, file_name, periode, catatan, uploaded_at, deleted_at from public.progress_reports`);
  for (const r of rep.rows) {
    items.push({
      bucket: "reports", kind: "report", path: r.file_path, name: r.file_name ?? "laporan.pdf",
      describe: `laporan ${r.id}`,
      link: async (fileId) => {
        if (!(await exists(students, r.student_id)) || !(await exists(users, r.tutor_id))) return false;
        await db().insert(progressReports).values({
          id: r.id, studentId: r.student_id, programId: r.program_id, tutorId: r.tutor_id, fileId,
          periode: r.periode, catatan: r.catatan, uploadedAt: r.uploaded_at, deletedAt: r.deleted_at,
        }).onConflictDoNothing();
        return true;
      },
    });
  }

  const mats = await old.query(`select id, judul, kategori, jenjang, file_path, file_name, uploaded_by, updated_at, deleted_at, created_at from public.materials`);
  for (const r of mats.rows) {
    items.push({
      bucket: "materials", kind: "material", path: r.file_path, name: r.file_name ?? r.file_path,
      describe: `materi "${r.judul}"`,
      link: async (fileId) => {
        await db().insert(materials).values({
          id: r.id, judul: r.judul, kategori: r.kategori, jenjang: r.jenjang, fileId,
          uploadedBy: (await exists(users, r.uploaded_by)) ? r.uploaded_by : null,
          updatedAt: r.updated_at, deletedAt: r.deleted_at, createdAt: r.created_at,
        }).onConflictDoNothing();
        return true;
      },
    });
  }

  const att = await old.query(`select id, foto_path from public.sessions where foto_path is not null`);
  for (const r of att.rows) {
    items.push({
      bucket: "attendance", kind: "attendance", path: r.foto_path, name: r.foto_path.split("/").pop(),
      describe: `foto absen sesi ${r.id}`,
      link: async (fileId) => {
        const u = await db().update(sessions).set({ fotoFileId: fileId }).where(eq(sessions.id, r.id)).returning({ id: sessions.id });
        return u.length > 0;
      },
    });
  }
  await old.end();

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"}: ${items.length} file ditemukan di DB lama`);
  const stat = { done: 0, skip: 0, already: 0, error: 0 };

  for (const it of items) {
    const legacyKey = `${it.bucket}/${it.path}`;
    const [prev] = await db().select({ id: files.id }).from(files).where(eq(files.legacyKey, legacyKey)).limit(1);
    if (!APPLY) {
      console.log(`  ${prev ? "[sudah]" : "[akan] "} ${legacyKey}  → ${it.describe}`);
      if (prev) stat.already++;
      continue;
    }
    try {
      let fileId = prev?.id;
      if (!fileId) {
        const bytes = await download(it.bucket, it.path);
        // Validasi isi yang sama dengan upload baru (whitelist + magic bytes)
        const v = await validateUpload(it.kind, new File([new Uint8Array(bytes)], it.name));
        const { key, size } = await saveFile({ category: it.kind, ext: v.ext, data: v.bytes });
        try {
          const [f] = await db().insert(files)
            .values({ kind: it.kind, storageKey: key, originalName: v.originalName, mime: v.mime, size, legacyKey })
            .returning({ id: files.id });
          fileId = f.id;
        } catch (e) {
          await deleteFile(key);
          throw e;
        }
      } else stat.already++;
      if (await it.link(fileId)) {
        stat.done++;
        console.log(`  ✅ ${legacyKey}`);
      } else {
        stat.skip++;
        console.log(`  ⏭  ${legacyKey} — data induk (siswa/tentor/sesi) belum ada di DB baru`);
      }
    } catch (e) {
      stat.error++;
      console.log(`  ❌ ${legacyKey} — ${(e as Error).message}`);
    }
  }
  console.log(`\nSelesai: ${JSON.stringify(stat)}${APPLY ? "" : "  (dry-run, tidak ada yang ditulis)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
