"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Camera, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { AppSelect } from "@/components/app/app-select";
import { tanggal, jam, siswaLabel } from "@/lib/format";
import { checkSessionConflicts, createSessions, updateSession, setAttendanceStatus } from "./actions";
import { findAllConflicts, KIND_LABEL, type Slot } from "@/lib/session-conflicts";
import { CameraAttendance } from "./camera-attendance";
import type { StudentProgramOpt } from "./page";
import type { ConflictInfo, SessionRow, TimelineTutor } from "@/server/services/sessions";
import { DatePicker, TimePicker } from "@/components/app/date-picker";
import { shiftAnchor, type TimelineView } from "@/lib/timeline-range";
import { Timeline, type TimelineNavState } from "./timeline";
import { SessionDetail } from "./session-detail";
import { cn } from "@/lib/utils";

export type { SessionRow };

type Win = { buka: number; tutup: number; /** absen susulan tanpa batas waktu */ bebas: boolean };

function inWindow(s: SessionRow, w: Win, now: number) {
  return now >= new Date(s.mulai_at).getTime() - w.buka * 60_000 && (w.bebas || now <= new Date(s.selesai_at).getTime() + w.tutup * 60_000);
}

const toSlot = (s: SessionRow): Slot => ({
  id: s.id,
  tutorId: s.tutor_id,
  studentId: s.students?.id ?? "",
  programId: s.programs?.id ?? "",
  start: new Date(s.mulai_at).getTime(),
  end: new Date(s.selesai_at).getTime(),
  cancelled: s.status_kehadiran === "batal",
});

/** "YYYY-MM-DD" & "HH:mm" WIB dari ISO, untuk form edit */
function wibParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
  return { tanggal: d.slice(0, 10), jam: d.slice(11, 16) };
}

export function ScheduleView({
  perm, me, sessions, nav, counts, tutors, studentPrograms, window: win, serverNow,
}: {
  /** Waktu server saat render: nilai awal jam supaya HTML server & klien identik (tanpa hydration mismatch). */
  serverNow: number;
  /** viewAll = akses Jadwal (Lihat) → semua tentor; selain itu (tentor) hanya jadwalnya sendiri. manage = akses Jadwal (Kelola). */
  perm: { viewAll: boolean; manage: boolean; superuser?: boolean };
  me: { id: string; nama: string };
  sessions: SessionRow[];
  /** Rentang & mode Resource Timeline. */
  nav: TimelineNavState;
  /** Jumlah sesi per tentor pada bulan yang sedang dilihat. */
  counts: Record<string, number>;
  tutors: TimelineTutor[];
  studentPrograms: StudentProgramOpt[];
  window: Win;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const [now, setNow] = useState(serverNow);
  const [creating, setCreating] = useState<{ tutorId?: string; tgl?: string } | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [overriding, setOverriding] = useState<SessionRow | null>(null);
  const [attending, setAttending] = useState<SessionRow | null>(null);
  const [detail, setDetail] = useState<SessionRow | null>(null);
  const activeTutors = useMemo(() => tutors.filter((t) => t.aktif), [tutors]);
  // Bentrok jadwal pada data yang sedang tampil (tentor/siswa sama, waktu beririsan; kelas kelompok dikecualikan)
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const conflictMap = useMemo(() => findAllConflicts(sessions.map(toSlot)), [sessions]);
  const conflictIds = useMemo(() => new Set(conflictMap.keys()), [conflictMap]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Ganti mode (minggu/bulan), geser periode, atau loncat ke tanggal tertentu. */
  function navigate(p: { view?: TimelineView; tgl?: string; dir?: 1 | -1 }) {
    const view = p.view ?? nav.view;
    const anchor = p.dir ? shiftAnchor(view, nav.anchor, p.dir) : (p.tgl ?? nav.anchor);
    startNav(() => router.push(`${pathname}?view=${view}&tgl=${anchor}`));
  }

  const absenButton = (s: SessionRow, big = false) => {
    if (s.tutor_id !== me.id || s.status_kehadiran !== "terjadwal") return null;
    const ok = inWindow(s, win, now);
    const early = now < new Date(s.mulai_at).getTime() - win.buka * 60_000;
    return (
      <div className="space-y-1">
        <Button className={big ? "h-12 w-full text-base" : ""} disabled={!ok} onClick={() => { setDetail(null); setAttending(s); }}>
          <Camera /> Absen
        </Button>
        {!ok && (
          <p className="text-xs text-muted-foreground">
            {early ? `Bisa absen mulai ${jam(new Date(new Date(s.mulai_at).getTime() - win.buka * 60_000))}` : "Waktu absen sudah lewat. Hubungi admin."}
          </p>
        )}
      </div>
    );
  };

  // Absen 1x klik: sesi milik akun ini yang sedang dalam jendela absen tampil di atas timeline
  const ready = useMemo(
    () => sessions.filter((s) => s.tutor_id === me.id && s.status_kehadiran === "terjadwal" && inWindow(s, win, now)).sort((a, b) => a.mulai_at.localeCompare(b.mulai_at)),
    [sessions, me.id, win, now],
  );

  return (
    <div className="space-y-4">
      {ready.length > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label="Siap absen">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="size-4 text-primary" /> Siap absen ({ready.length})
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {ready.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Clock className="size-4" /> {jam(s.mulai_at)} - {jam(s.selesai_at)} <span className="font-normal text-muted-foreground">• {tanggal(s.mulai_at, false)}</span>
                  </p>
                  <p className="mt-0.5 truncate font-semibold">
                    {siswaLabel(s.students)} {s.students?.kelas && <span className="font-normal text-muted-foreground">• {s.students.kelas}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.programs?.nama}</p>
                </div>
                <Button className="h-11 shrink-0 px-5 text-base" onClick={() => setAttending(s)}>
                  <Camera /> Absen
                </Button>
              </div>
            ))}
          </div>
          {ready.length > 6 && <p className="mt-2 text-xs text-muted-foreground">+{ready.length - 6} sesi lain; buka dari jadwal di bawah.</p>}
        </section>
      )}

      <div className={cn(navPending && "pointer-events-none opacity-60 transition-opacity")} aria-busy={navPending}>
        <Timeline
          sessions={sessions}
          tutors={tutors}
          counts={counts}
          conflictIds={conflictIds}
          nav={nav}
          now={now}
          canManage={perm.manage}
          single={!perm.viewAll}
          onNavigate={navigate}
          onCreate={(init) => setCreating(init ?? {})}
          onOpen={setDetail}
        />
      </div>

      {creating && <CreateDialog tutors={activeTutors} studentPrograms={studentPrograms} initial={creating} onClose={() => setCreating(null)} />}
      {editing && <EditDialog s={editing} tutors={activeTutors} onClose={() => setEditing(null)} />}
      {overriding && <OverrideDialog s={overriding} onClose={() => setOverriding(null)} />}
      {detail && (
        <SessionDetail
          s={detail}
          tutor={tutors.find((t) => t.id === detail.tutor_id)}
          now={now}
          canManage={perm.manage}
          isSuperuser={!!perm.superuser}
          conflicts={(conflictMap.get(detail.id) ?? []).flatMap((c) => {
            const other = sessionById.get(c.other.id);
            return other ? [{ session: other, kinds: c.kinds }] : [];
          })}
          absenSlot={absenButton(detail, true)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onOverride={() => { setOverriding(detail); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}
      {attending && (
        <CameraAttendance
          session={attending}
          tutorName={me.nama}
          onClose={() => setAttending(null)}
          onDone={() => { setAttending(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** Cek bentrok ke server (ditunda 350 ms setelah form berhenti berubah). Hanya peringatan, tidak memblokir. */
function useConflicts(input: Parameters<typeof checkSessionConflicts>[0]) {
  const [list, setList] = useState<ConflictInfo[]>([]);
  const key = JSON.stringify(input);
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      const r = await checkSessionConflicts(JSON.parse(key));
      if (!stale) setList(r.ok ? r.conflicts : []);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [key]);
  return list;
}

function ConflictWarning({ list }: { list: ConflictInfo[] }) {
  if (!list.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-4 text-amber-600" /> Jadwal ini bentrok dengan {list.length} sesi lain
      </p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {list.map((c) => (
          <li key={`${c.tanggal}-${c.jenis}-${c.jam}-${c.siswa}-${c.program}`}>
            <b>{tanggal(`${c.tanggal}T12:00:00+07:00`)}</b> • {KIND_LABEL[c.jenis]}: {c.jam} — {c.siswa}
            {c.kelas ? ` (${c.kelas})` : ""}, {c.program}
            {c.jenis === "siswa" ? ` · tentor ${c.tentor}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-amber-900/80">Tetap bisa disimpan bila memang disengaja.</p>
    </div>
  );
}

function CreateDialog({ tutors, studentPrograms, initial, onClose }: {
  tutors: { id: string; nama: string }[];
  studentPrograms: StudentProgramOpt[];
  /** Diisi saat dibuka dari klik sel Resource Timeline (tentor & tanggal sudah terpilih). */
  initial?: { tutorId?: string; tgl?: string };
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [spId, setSpId] = useState("");
  const [tutorId, setTutorId] = useState(initial?.tutorId ?? "");
  const [tgl, setTgl] = useState(initial?.tgl ?? "");
  const [mulai, setMulai] = useState("16:00");
  const [selesai, setSelesai] = useState("17:00");
  const [ulang, setUlang] = useState(1);
  const conflicts = useConflicts({ tutor_id: tutorId, student_program_id: spId, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai, ulang_minggu: ulang });

  return (
    <FormDialog title="Buat Jadwal" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Siswa & program *" className="sm:col-span-2">
          <AppSelect
            value={spId}
            placeholder="Pilih siswa & program"
            onChange={(v) => {
              setSpId(v);
              const sp = studentPrograms.find((x) => x.id === v);
              // Dibuka dari sel tentor tertentu: jangan timpa pilihan tentor itu
              if (sp?.tutor_id && !initial?.tutorId) setTutorId(sp.tutor_id);
            }}
            options={studentPrograms
              .slice()
              // siswa binaan tentor terpilih tampil duluan
              .sort((a, b) => Number(b.tutor_id === tutorId) - Number(a.tutor_id === tutorId) || a.students.nama.localeCompare(b.students.nama))
              .map((sp) => ({ value: sp.id, label: `${sp.students.nama} — ${sp.programs?.nama}` }))}
          />
        </Field>
        <Field label="Tentor *" className="sm:col-span-2" hint="Otomatis terisi tentor pengampu, bisa diganti.">
          <AppSelect value={tutorId} onChange={setTutorId} placeholder="Pilih tentor" options={tutors.map((t) => ({ value: t.id, label: t.nama }))} />
        </Field>
        <Field label="Tanggal *"><DatePicker value={tgl} onChange={setTgl} /></Field>
        <Field label="Ulang mingguan" hint="Jumlah minggu (1 = sekali)">
          <Input type="number" min={1} max={12} value={ulang} onChange={(e) => setUlang(Number(e.target.value))} />
        </Field>
        <Field label="Jam mulai (WIB)"><TimePicker aria-label="Jam mulai" value={mulai} onChange={setMulai} /></Field>
        <Field label="Jam selesai (WIB)"><TimePicker aria-label="Jam selesai" value={selesai} onChange={setSelesai} /></Field>
      </div>
      <ConflictWarning list={conflicts} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await createSessions({ student_program_id: spId, tutor_id: tutorId, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai, ulang_minggu: ulang });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >{pending ? "Menyimpan..." : conflicts.length ? "Tetap simpan" : "Simpan"}</Button>
      </div>
    </FormDialog>
  );
}

function EditDialog({ s, tutors, onClose }: { s: SessionRow; tutors: { id: string; nama: string }[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const a = wibParts(s.mulai_at);
  const b = wibParts(s.selesai_at);
  const [tutorId, setTutorId] = useState(s.tutor_id);
  const [tgl, setTgl] = useState(a.tanggal);
  const [mulai, setMulai] = useState(a.jam);
  const [selesai, setSelesai] = useState(b.jam);
  const conflicts = useConflicts({ tutor_id: tutorId, session_id: s.id, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai });
  return (
    <FormDialog title="Edit Jadwal" desc={`${s.students?.nama} — ${s.programs?.nama}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tentor" className="sm:col-span-3">
          <AppSelect value={tutorId} onChange={setTutorId} options={tutors.map((t) => ({ value: t.id, label: t.nama }))} />
        </Field>
        <Field label="Tanggal"><DatePicker value={tgl} onChange={setTgl} /></Field>
        <Field label="Mulai"><TimePicker aria-label="Jam mulai" value={mulai} onChange={setMulai} /></Field>
        <Field label="Selesai"><TimePicker aria-label="Jam selesai" value={selesai} onChange={setSelesai} /></Field>
      </div>
      <ConflictWarning list={conflicts} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await updateSession({ id: s.id, tutor_id: tutorId, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >{conflicts.length ? "Tetap simpan" : "Simpan"}</Button>
      </div>
    </FormDialog>
  );
}

function OverrideDialog({ s, onClose }: { s: SessionRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SessionRow["status_kehadiran"]>(s.status_kehadiran === "terjadwal" ? "hadir" : "terjadwal");
  const [alasan, setAlasan] = useState("");
  return (
    <FormDialog title="Ubah Kehadiran (Admin)" desc={`${s.students?.nama} • ${tanggal(s.mulai_at)} ${jam(s.mulai_at)}`} onClose={onClose}>
      <Field label="Status baru">
        <AppSelect
          value={status}
          onChange={(v) => setStatus(v as SessionRow["status_kehadiran"])}
          options={[
            { value: "hadir", label: "Hadir (absen manual)" },
            { value: "tidak_hadir", label: "Tidak Hadir" },
            { value: "batal", label: "Batal" },
            { value: "terjadwal", label: "Reset ke Terjadwal (foto lama dihapus)" },
          ]}
        />
      </Field>
      <Field label={status === "hadir" ? "Alasan absen manual *" : "Catatan"}>
        <Textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. HP tentor rusak, foto dikirim via WA" />
      </Field>
      {s.catatan_admin && <p className="text-xs text-muted-foreground">Catatan sebelumnya: {s.catatan_admin}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await setAttendanceStatus(s.id, status, alasan);
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >Simpan</Button>
      </div>
    </FormDialog>
  );
}
