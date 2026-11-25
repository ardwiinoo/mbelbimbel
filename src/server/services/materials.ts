import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { auditLog, files, materials } from "@/db/schema";
import { assertCan, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";
import { alias } from "drizzle-orm/pg-core";
import { users } from "@/db/schema";

const updaterUser = alias(users, "updater_user");
const uploaderUser = alias(users, "uploader_user");

export type MaterialRow = {
  id: string;
  judul: string;
  kategori: string;
  jenjang: string;
  file_id: string;
  file_name: string;
  mime: string;
  ukuran: number;
  updated_at: string;
  /** nama pengunggah / pengubah terakhir */
  updated_by: string | null;
};

/** Semua user aktif boleh membaca bank materi. */
export async function listMaterials(actor: Actor): Promise<MaterialRow[]> {
  assertCan(actor, "materi", "read");
  const rows = await db()
    .select({ m: materials, f: files, uNama: updaterUser.nama, cNama: uploaderUser.nama })
    .from(materials)
    .innerJoin(files, eq(files.id, materials.fileId))
    .leftJoin(updaterUser, eq(updaterUser.id, materials.updatedBy))
    .leftJoin(uploaderUser, eq(uploaderUser.id, materials.uploadedBy))
    .where(isNull(materials.deletedAt))
    .orderBy(desc(materials.updatedAt));
  return rows.map(({ m, f, uNama, cNama }) => ({
    id: m.id,
    judul: m.judul,
    kategori: m.kategori,
    jenjang: m.jenjang,
    file_id: f.id,
    file_name: f.originalName,
    mime: f.mime,
    ukuran: f.size,
    updated_at: m.updatedAt.toISOString(),
    updated_by: uNama ?? cNama ?? null,
  }));
}

const metaSchema = z.object({
  id: z.string().uuid().optional(),
  judul: z.string().trim().min(2, "Judul wajib diisi").max(200),
  kategori: z.string().trim().min(1, "Kategori wajib diisi").max(100),
  jenjang: z.string().trim().min(1, "Jenjang wajib diisi").max(100),
});

/** Tambah/edit materi (admin). File wajib saat tambah, opsional saat edit (ganti file). */
export async function saveMaterial(actor: Actor | null, input: z.input<typeof metaSchema> & { file: File | null }) {
  assertCan(actor, "materi", "write");
  const p = metaSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const { id, ...meta } = p.data;
  const hasFile = !!input.file && input.file.size > 0;
  if (!id && !hasFile) throw new UserError("Pilih file materi");

  /** Tulis materi; bila file diganti, kembalikan storage key file lama untuk dihapus. */
  const write = async (tx: Tx, fileId?: string): Promise<string | null> => {
    if (id) {
      const [cur] = await tx
        .select({ fileId: materials.fileId })
        .from(materials)
        .where(and(eq(materials.id, id), isNull(materials.deletedAt)))
        .for("update");
      if (!cur) throw new UserError("Materi tidak ditemukan");
      await tx
        .update(materials)
        .set({ ...meta, ...(fileId ? { fileId } : {}), updatedAt: new Date(), updatedBy: actor.id })
        .where(eq(materials.id, id));
      return fileId ? detachFileRow(tx, cur.fileId) : null;
    }
    await tx.insert(materials).values({ ...meta, fileId: fileId!, uploadedBy: actor.id });
    return null;
  };

  // File diganti → file lama dihapus setelah transaksi sukses (tidak menumpuk).
  const oldKey = hasFile ? await withUploadedFile("material", input.file, actor, write) : await db().transaction((tx) => write(tx));
  await purgeStoredFiles([oldKey]);
  return hasFile && id ? "Materi disimpan (file lama dihapus)" : "Materi disimpan";
}

/**
 * Hapus materi: baris dan file fisiknya dihapus permanen (tidak menyisakan file di server).
 * Jejak "siapa menghapus" tersimpan di audit log.
 */
export async function deleteMaterial(actor: Actor | null, id: string) {
  assertCan(actor, "materi", "write");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Materi tidak ditemukan");
  const key = await db().transaction(async (tx) => {
    const [m] = await tx
      .select({ fileId: materials.fileId, judul: materials.judul })
      .from(materials)
      .where(and(eq(materials.id, id), isNull(materials.deletedAt)))
      .for("update");
    if (!m) throw new UserError("Materi tidak ditemukan");
    await tx.delete(materials).where(eq(materials.id, id));
    const k = await detachFileRow(tx, m.fileId);
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "hapus_materi", target: id, detail: { judul: m.judul } });
    return k;
  });
  await purgeStoredFiles([key]);
  return "Materi dihapus beserta filenya.";
}
