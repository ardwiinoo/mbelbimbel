// Hitung rentang tanggal Resource Timeline (mingguan / bulanan). Semua dalam string "YYYY-MM-DD"
// (kalender WIB, tanpa zona waktu) sehingga hasilnya sama di server maupun browser.

export type TimelineView = "minggu" | "bulan";

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, n: number) {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

/** Senin dari minggu yang memuat tanggal ini. */
export function weekStart(ymd: string) {
  return addDays(ymd, -((utc(ymd).getUTCDay() + 6) % 7));
}

export function rangeFor(view: TimelineView, anchor: string) {
  if (view === "bulan") {
    const [y, m] = anchor.split("-").map(Number);
    return { from: `${y}-${pad(m)}-01`, to: toYmd(new Date(Date.UTC(y, m, 0))) };
  }
  const from = weekStart(anchor);
  return { from, to: addDays(from, 6) };
}

/** Geser satu minggu / satu bulan. Bulanan selalu mendarat di tanggal 1. */
export function shiftAnchor(view: TimelineView, anchor: string, dir: 1 | -1) {
  if (view === "minggu") return addDays(anchor, 7 * dir);
  const [y, m] = anchor.split("-").map(Number);
  return toYmd(new Date(Date.UTC(y, m - 1 + dir, 1)));
}

export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Tanggal WIB ("YYYY-MM-DD") dari sebuah waktu. */
export function ymdWib(t: number | string | Date) {
  return new Date(new Date(t).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const BULAN_NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "23 – 29 Nov 2026" (mingguan) atau "November 2026" (bulanan). */
export function rangeLabel(view: TimelineView, from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (view === "bulan") return `${BULAN_NAMA[fm - 1]} ${fy}`;
  if (fy !== ty) return `${fd} ${BULAN_PENDEK[fm - 1]} ${fy} – ${td} ${BULAN_PENDEK[tm - 1]} ${ty}`;
  if (fm !== tm) return `${fd} ${BULAN_PENDEK[fm - 1]} – ${td} ${BULAN_PENDEK[tm - 1]} ${ty}`;
  return `${fd} – ${td} ${BULAN_PENDEK[tm - 1]} ${ty}`;
}
