import { and, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { files, materials, progressReports, sessions } from "@/db/schema";
import { deleteFile, saveFile } from "@/lib/storage";
import { can } from "@/lib/access";
import type { Actor } from "./authz";
import { validateUpload, type FileKind } from "./file-rules";

/**
 * Validasi + simpan file ke storage, lalu jalankan `fn` dalam SATU transaksi DB
 * bersama pencatatan metadata file. Bila transaksi gagal, file di disk dihapus
 * lagi sehingga tidak ada file yatim.
 */
export async function withUploadedFile<T>(
  kind: FileKind,
  file: File | null | undefined,
  actor: Actor,
  fn: (tx: Tx, fileId: string) => Promise<T>,
): Promise<T> {
  const v = await validateUpload(kind, file);
  const { key, size } = await saveFile({ category: kind, ext: v.ext, data: v.bytes });
  try {
    return await db().transaction(async (tx) => {
      const [row] = await tx
        .insert(files)
        .values({ kind, storageKey: key, originalName: v.originalName, mime: v.mime, size, createdBy: actor.id })
        .returning({ id: files.id });
      return fn(tx, row.id);
    });
  } catch (e) {
    await deleteFile(key).catch(() => {});
    throw e;
  }
}

export type FileRow = typeof files.$inferSelect;

/**
 * Siapa boleh membaca file ini (pengganti Storage policy):
 * - assessment : akses Asesmen (Lihat)
 * - attendance : akses Jadwal (Lihat), ATAU tentor pemilik sesi yang memakai foto ini
 * - report     : akses Laporan (Lihat), ATAU tentor pengunggah laporan (belum dihapus)
 * - material   : akses Bank Materi (Lihat), selama materinya belum dihapus
 *                (pemegang Kelola tetap bisa membuka file materi yang dihapus)
 */
export async function findReadableFile(actor: Actor, fileId: string): Promise<FileRow | null> {
  if (actor.status !== "aktif" || !/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [f] = await db().select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!f) return null;

  let rows: unknown[] = [];
  switch (f.kind) {
    case "assessment":
      return can(actor, "asesmen", "read") ? f : null;
    case "attendance":
      if (can(actor, "jadwal", "read")) return f;
      if (!actor.isTutor) return null;
      rows = await db()
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.fotoFileId, f.id), eq(sessions.tutorId, actor.id)))
        .limit(1);
      break;
    case "report":
      if (can(actor, "laporan", "read")) return f;
      if (!actor.isTutor) return null;
      rows = await db()
        .select({ id: progressReports.id })
        .from(progressReports)
        .where(and(eq(progressReports.fileId, f.id), eq(progressReports.tutorId, actor.id), isNull(progressReports.deletedAt)))
        .limit(1);
      break;
    case "material":
      if (can(actor, "materi", "write")) return f;
      if (!can(actor, "materi", "read")) return null;
      rows = await db()
        .select({ id: materials.id })
        .from(materials)
        .where(and(eq(materials.fileId, f.id), isNull(materials.deletedAt)))
        .limit(1);
      break;
  }
  return rows.length ? f : null;
}

/**
 * Hapus metadata file lama DI DALAM transaksi (panggil setelah baris pemakainya
 * sudah tidak merujuk file ini). Mengembalikan storage key untuk dihapus dari
 * disk SETELAH commit lewat purgeStoredFiles().
 */
export async function detachFileRow(tx: Tx, fileId: string | null | undefined): Promise<string | null> {
  if (!fileId) return null;
  const [row] = await tx.delete(files).where(eq(files.id, fileId)).returning({ key: files.storageKey });
  return row?.key ?? null;
}

/** Hapus file fisik setelah transaksi sukses. Gagal hapus tidak menggagalkan request (hanya dicatat). */
export async function purgeStoredFiles(keys: (string | null | undefined)[]) {
  for (const key of keys) {
    if (!key) continue;
    await deleteFile(key).catch((e) => console.error("[storage] gagal hapus file lama", key, e));
  }
}
