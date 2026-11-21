// Abstraksi penyimpanan file. SEMUA kode lain wajib lewat modul ini
// (saveFile / getFile / deleteFile) supaya backend bisa diganti ke S3 nanti
// tanpa mengubah kode lain. Implementasi saat ini: disk lokal di UPLOAD_DIR.
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Folder root upload. Default /app/uploads (di-mount dari volume Docker). JANGAN di public/. */
function root() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "/app/uploads");
}

// Key = "<kategori>/<yyyy>/<mm>/<uuid>.<ext>" — tidak pernah memakai nama dari pengguna.
const KEY_RE = /^[a-z]{3,20}\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/;

export class StorageNotFoundError extends Error {}

/** Ubah key relatif menjadi path absolut, dengan proteksi path traversal. */
function resolveKey(key: string) {
  if (typeof key !== "string" || !KEY_RE.test(key) || key.includes("..") || key.includes("\\") || path.isAbsolute(key)) {
    throw new Error("Storage key tidak valid");
  }
  const base = root();
  const full = path.resolve(/*turbopackIgnore: true*/ base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Storage key keluar dari UPLOAD_DIR");
  return full;
}

export type SaveInput = {
  /** kategori folder, mis. "attendance" */
  category: string;
  /** ekstensi hasil validasi server (tanpa titik), mis. "pdf" */
  ext: string;
  data: Uint8Array | Readable | ReadableStream<Uint8Array>;
};

/** Simpan file dan kembalikan key relatif + ukurannya. Nama file di disk selalu UUID acak. */
export async function saveFile({ category, ext, data }: SaveInput): Promise<{ key: string; size: number }> {
  if (!/^[a-z]{3,20}$/.test(category)) throw new Error("Kategori tidak valid");
  if (!/^[a-z0-9]{1,5}$/.test(ext)) throw new Error("Ekstensi tidak valid");
  const now = new Date();
  const key = `${category}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  const full = resolveKey(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });

  // Tulis ke file sementara lalu rename → tidak ada file setengah jadi bila gagal.
  const tmp = `${full}.part`;
  try {
    const src =
      data instanceof Uint8Array
        ? Readable.from([data])
        : data instanceof Readable
          ? data
          : Readable.fromWeb(data as import("node:stream/web").ReadableStream<Uint8Array>);
    await pipeline(src, createWriteStream(/*turbopackIgnore: true*/ tmp, { flags: "wx", mode: 0o640 }));
    await rename(/*turbopackIgnore: true*/ tmp, full);
  } catch (e) {
    await rm(/*turbopackIgnore: true*/ tmp, { force: true });
    throw e;
  }
  const { size } = await stat(/*turbopackIgnore: true*/ full);
  return { key, size };
}

/** Buka file untuk dibaca secara streaming (tidak memuat seluruh file ke memori). */
export async function getFile(key: string): Promise<{ stream: Readable; size: number }> {
  const full = resolveKey(key);
  try {
    const st = await stat(/*turbopackIgnore: true*/ full);
    if (!st.isFile()) throw new StorageNotFoundError(key);
    return { stream: createReadStream(/*turbopackIgnore: true*/ full), size: st.size };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
    throw e;
  }
}

export async function deleteFile(key: string) {
  try {
    await unlink(/*turbopackIgnore: true*/ resolveKey(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
