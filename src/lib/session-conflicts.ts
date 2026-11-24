// Aturan "bentrok jadwal" — satu definisi, dipakai server (cek saat membuat/mengubah jadwal)
// dan klien (penanda di Resource Timeline). Modul murni tanpa dependensi.
//
// Dua sesi BENTROK bila waktunya beririsan (selesai sesi A > mulai sesi B, dan sebaliknya) dan:
//  - "tentor": tentor yang sama mengajar di dua tempat sekaligus — KECUALI kelas kelompok, yaitu
//    program yang sama dengan jam mulai & selesai persis sama (satu tentor, beberapa siswa).
//  - "siswa": siswa yang sama dijadwalkan dua kali pada waktu yang beririsan.
// Sesi berstatus batal tidak pernah dianggap bentrok. Sesi yang hanya berurutan (selesai = mulai) bukan bentrok.

export type Slot = {
  id: string;
  tutorId: string;
  studentId: string;
  programId: string;
  /** epoch ms */
  start: number;
  end: number;
  cancelled: boolean;
};

export type ConflictKind = "tentor" | "siswa";

export const overlaps = (a: Pick<Slot, "start" | "end">, b: Pick<Slot, "start" | "end">) => a.start < b.end && b.start < a.end;

/** Jenis bentrok antara dua sesi berbeda ([] = aman). */
export function conflictKinds(a: Slot, b: Slot): ConflictKind[] {
  if (a.id === b.id || a.cancelled || b.cancelled || !overlaps(a, b)) return [];
  const kinds: ConflictKind[] = [];
  if (a.tutorId === b.tutorId) {
    const isGroupClass = a.programId === b.programId && a.start === b.start && a.end === b.end;
    if (!isGroupClass) kinds.push("tentor");
  }
  if (a.studentId === b.studentId) kinds.push("siswa");
  return kinds;
}

/** Semua pasangan bentrok dalam satu kumpulan sesi: id sesi -> daftar lawannya (beserta jenisnya). */
export function findAllConflicts(slots: Slot[]): Map<string, { other: Slot; kinds: ConflictKind[] }[]> {
  const out = new Map<string, { other: Slot; kinds: ConflictKind[] }[]>();
  const push = (a: Slot, b: Slot, kinds: ConflictKind[]) => out.set(a.id, [...(out.get(a.id) ?? []), { other: b, kinds }]);
  // Kelompokkan per tentor dan per siswa supaya tidak O(n²) atas seluruh data
  const buckets = new Map<string, Slot[]>();
  for (const s of slots) {
    if (s.cancelled) continue;
    for (const k of [`t:${s.tutorId}`, `s:${s.studentId}`]) buckets.set(k, [...(buckets.get(k) ?? []), s]);
  }
  const seen = new Set<string>();
  for (const list of buckets.values()) {
    list.sort((x, y) => x.start - y.start);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
        const key = list[i].id < list[j].id ? `${list[i].id}|${list[j].id}` : `${list[j].id}|${list[i].id}`;
        if (seen.has(key)) continue;
        const kinds = conflictKinds(list[i], list[j]);
        if (!kinds.length) continue;
        seen.add(key);
        push(list[i], list[j], kinds);
        push(list[j], list[i], kinds);
      }
    }
  }
  return out;
}

export const KIND_LABEL: Record<ConflictKind, string> = { tentor: "Tentor sama", siswa: "Siswa sama" };

/**
 * Tata letak gaya Google Calendar untuk sesi dalam SATU sel (tentor × hari).
 * Sesi yang waktunya saling beririsan dikelompokkan ("cluster") lalu dibagi ke jalur (lane) berdampingan;
 * sesi yang tidak beririsan jadi cluster tersendiri dan tetap bertumpuk ke bawah.
 * Hasil: cluster[] → lane[] → item[] (urut waktu). Tidak ada item yang hilang atau ganda.
 */
export function layoutLanes<T>(items: T[], range: (t: T) => { start: number; end: number }): T[][][] {
  const sorted = [...items].sort((a, b) => range(a).start - range(b).start || range(a).end - range(b).end);
  const clusters: T[][][] = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];
  for (const it of sorted) {
    const { start, end } = range(it);
    if (!clusters.length || start >= clusterEnd) {
      clusters.push([]);
      laneEnds = [];
      clusterEnd = -Infinity;
    }
    const cluster = clusters[clusters.length - 1];
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(-Infinity);
      cluster.push([]);
    }
    cluster[lane].push(it);
    laneEnds[lane] = end;
    clusterEnd = Math.max(clusterEnd, end);
  }
  return clusters;
}
