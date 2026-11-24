export const TZ = "Asia/Jakarta";

export function rupiah(n: number | null | undefined) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(n ?? 0);
}

/** "Rabu, 12 Apr 2026" */
export function tanggal(d: string | Date | null | undefined, withDay = true) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    weekday: withDay ? "long" : undefined,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

/** "16.00" */
export function jam(d: string | Date | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    .format(new Date(d))
    .replace(":", ".");
}

export function tanggalJam(d: string | Date | null | undefined) {
  if (!d) return "-";
  return `${tanggal(d, false)} (${jam(d)})`;
}

/** Nama yang ditampilkan untuk siswa: panggilan bila ada, selain itu nama lengkap. */
export function siswaLabel(s: { nama: string; panggilan?: string | null } | null | undefined) {
  return s?.panggilan?.trim() || s?.nama || "-";
}

export function umur(tglLahir: string | null | undefined) {
  if (!tglLahir) return null;
  const b = new Date(tglLahir);
  const n = new Date();
  let u = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) u--;
  return u;
}

/** 0813-9876-5432 -> 6281398765432 */
export function waNumber(no: string | null | undefined) {
  if (!no) return "";
  let d = no.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

export function waLink(no: string | null | undefined, text?: string) {
  const n = waNumber(no);
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Ubah input "YYYY-MM-DD" + "HH:mm" (WIB) menjadi ISO UTC. */
export function wibToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

/** Bulan WIB "YYYY-MM" untuk sebuah timestamp */
export function bulanWib(d: string | Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" })
    .formatToParts(new Date(d));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function namaBulan(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export const KATEGORI_LABEL: Record<string, string> = { privat: "Privat", kelompok: "Kelompok", abk: "ABK" };
