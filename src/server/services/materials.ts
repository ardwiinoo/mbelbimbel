import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { auditLog, files, materials } from "@/db/schema";
import { assertActive, assertAdmin, UserError, type Actor } from "../authz";
import { withUploadedFile } from "../files";

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
};

/** Semua user aktif boleh membaca bank materi. */
export async function listMaterials(actor: Actor): Promise<MaterialRow[]> {
  assertActive(actor);
  const rows = await db()
    .select({ m: materials, f: files })
    .from(materials)
    .innerJoin(files, eq(files.id, materials.fileId))
    .where(isNull(materials.deletedAt))
    .orderBy(desc(materials.updatedAt));
  return rows.map(({ m, f }) => ({
    id: m.id,
    judul: m.judul,
    kategori: m.kategori,
    jenjang: m.jenjang,
    file_id: f.id,
    file_name: f.originalName,
    mime: f.mime,
    ukuran: f.size,
    updated_at: m.updatedAt.toISOString(),
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
  assertAdmin(actor);
  const p = metaSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const { id, ...meta } = p.data;
  const hasFile = !!input.file && input.file.size > 0;
  if (!id && !hasFile) throw new UserError("Pilih file materi");

  const write = async (tx: Tx, fileId?: string) => {
    if (id) {
      const r = await tx
        .update(materials)
        .set({ ...meta, ...(fileId ? { fileId } : {}), updatedAt: new Date() })
        .where(and(eq(materials.id, id), isNull(materials.deletedAt)))
        .returning({ id: materials.id });
      if (!r.length) throw new UserError("Materi tidak ditemukan");
    } else {
      await tx.insert(materials).values({ ...meta, fileId: fileId!, uploadedBy: actor.id });
    }
  };

  // File lama tidak dihapus saat diganti (retensi: simpan selamanya).
  if (hasFile) await withUploadedFile("material", input.file, actor, write);
  else await db().transaction((tx) => write(tx));
  return "Materi disimpan";
}

export async function softDeleteMaterial(actor: Actor | null, id: string) {
  assertAdmin(actor);
  const r = await db()
    .update(materials)
    .set({ deletedAt: new Date() })
    .where(and(eq(materials.id, id), isNull(materials.deletedAt)))
    .returning({ id: materials.id });
  if (!r.length) throw new UserError("Materi tidak ditemukan");
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "hapus_materi", target: id });
  return "Materi dihapus (soft delete)";
}
