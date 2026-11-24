// Whitelist tipe & ukuran file per jenis upload. Tipe ditentukan dari ISI file
// (magic bytes) + ekstensi, bukan dari Content-Type kiriman browser.
import { UserError } from "./authz";

export type FileKind = "assessment" | "attendance" | "report" | "material" | "signature" | "logo";

type FileType = { ext: string; mime: string; magic: (b: Uint8Array) => boolean };

const starts = (sig: number[]) => (b: Uint8Array) => sig.every((v, i) => b[i] === v);
const PDF: FileType = { ext: "pdf", mime: "application/pdf", magic: starts([0x25, 0x50, 0x44, 0x46, 0x2d]) }; // %PDF-
const JPG: FileType = { ext: "jpg", mime: "image/jpeg", magic: starts([0xff, 0xd8, 0xff]) };
const PNG: FileType = { ext: "png", mime: "image/png", magic: starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
const zip = starts([0x50, 0x4b, 0x03, 0x04]); // DOCX/XLSX/PPTX
const ole = starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // DOC/XLS/PPT lama
const OFFICE: FileType[] = [
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: zip },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: zip },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: zip },
  { ext: "doc", mime: "application/msword", magic: ole },
  { ext: "xls", mime: "application/vnd.ms-excel", magic: ole },
  { ext: "ppt", mime: "application/vnd.ms-powerpoint", magic: ole },
];

const MB = 1024 * 1024;
export const FILE_RULES: Record<FileKind, { types: FileType[]; maxBytes: number; label: string }> = {
  assessment: { types: [PDF, JPG, PNG], maxBytes: 10 * MB, label: "PDF/JPG/PNG maks 10 MB" },
  attendance: { types: [JPG], maxBytes: 2 * MB, label: "foto JPEG maks 2 MB" },
  report: { types: [PDF], maxBytes: 10 * MB, label: "PDF maks 10 MB" },
  material: { types: [PDF, JPG, PNG, ...OFFICE], maxBytes: 25 * MB, label: "PDF/gambar/Office maks 25 MB" },
  signature: { types: [PNG, JPG], maxBytes: 2 * MB, label: "gambar PNG/JPG maks 2 MB" },
  logo: { types: [PNG, JPG], maxBytes: 2 * MB, label: "gambar PNG/JPG maks 2 MB" },
};

/** Batas terbesar dari semua jenis (dipakai untuk menolak body terlalu besar lebih awal). */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(FILE_RULES).map((r) => r.maxBytes));

/**
 * Validasi file upload. Mengembalikan ext & mime yang DIPERCAYA (dari whitelist),
 * beserta isi file. Melempar UserError bila ditolak.
 */
export async function validateUpload(kind: FileKind, file: File | null | undefined) {
  const rule = FILE_RULES[kind];
  if (!file || typeof file === "string" || file.size === 0) throw new UserError("File wajib diunggah");
  if (file.size > rule.maxBytes) throw new UserError(`File terlalu besar (${rule.label})`);

  const name = (file.name || "").toLowerCase();
  const nameExt = name.includes(".") ? name.split(".").pop()! : "";
  const bytes = new Uint8Array(await file.arrayBuffer());

  // jpeg boleh berekstensi .jpeg; foto absen dari canvas boleh tanpa ekstensi
  const normExt = nameExt === "jpeg" ? "jpg" : nameExt;
  const type = rule.types.find((t) => t.magic(bytes) && (t.ext === normExt || (kind === "attendance" && !nameExt)));
  if (!type) throw new UserError(`Tipe file tidak diizinkan (${rule.label})`);

  const originalName = (file.name || `upload.${type.ext}`).replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 200);
  return { bytes, ext: type.ext, mime: type.mime, originalName };
}
