"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Plus, Camera, MapPin, Pencil, ShieldCheck, Clock, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, Td, Pill, EmptyState, KEHADIRAN, selectClass } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { fileHref } from "@/components/app/file-link";
import { tanggal, jam, tanggalJam, TZ } from "@/lib/format";
import { createSessions, updateSession, setAttendanceStatus } from "./actions";
import { CameraAttendance } from "./camera-attendance";
import type { StudentProgramOpt } from "./page";
import type { SessionRow } from "@/server/services/sessions";

export type { SessionRow };

type Win = { buka: number; tutup: number };

function inWindow(s: SessionRow, w: Win, now: number) {
  return now >= new Date(s.mulai_at).getTime() - w.buka * 60_000 && now <= new Date(s.selesai_at).getTime() + w.tutup * 60_000;
}

/** "YYYY-MM-DD" & "HH:mm" WIB dari ISO, untuk form edit */
function wibParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
  return { tanggal: d.slice(0, 10), jam: d.slice(11, 16) };
}

export function ScheduleView({
  isAdmin, me, sessions, filters, tutors, studentPrograms, window: win,
}: {
  isAdmin: boolean;
  me: { id: string; nama: string };
  sessions: SessionRow[];
  filters: { from: string; to: string; tutor: string; status: string; student: string };
  tutors: { id: string; nama: string }[];
  studentPrograms: StudentProgramOpt[];
  window: Win;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [overriding, setOverriding] = useState<SessionRow | null>(null);
  const [attending, setAttending] = useState<SessionRow | null>(null);
  const [photo, setPhoto] = useState<SessionRow | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  function setFilter(k: string, v: string) {
    const q = new URLSearchParams({ ...filters, [k]: v });
    [...q.entries()].forEach(([key, val]) => !val && q.delete(key));
    router.push(`${pathname}?${q}`);
  }

  // Kelompokkan per tanggal (WIB) untuk tampilan kartu
  const groups = useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const k = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(s.mulai_at));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [sessions]);

  const absenButton = (s: SessionRow, big = false) => {
    if (isAdmin || s.status_kehadiran !== "terjadwal") return null;
    const ok = inWindow(s, win, now);
    const early = now < new Date(s.mulai_at).getTime() - win.buka * 60_000;
    return (
      <div className="space-y-1">
        <Button className={big ? "h-12 w-full text-base" : ""} disabled={!ok} onClick={() => setAttending(s)}>
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

  const kehadiranCell = (s: SessionRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill color={KEHADIRAN[s.status_kehadiran].color}>{KEHADIRAN[s.status_kehadiran].label}</Pill>
      {s.foto_file_id && (
        <Button size="xs" variant="outline" onClick={() => setPhoto(s)}>
          <ImageIcon /> Foto Bukti
        </Button>
      )}
      {s.status_kehadiran === "hadir" && !s.foto_file_id && <span className="text-xs text-muted-foreground">(manual)</span>}
    </div>
  );

  const tagihanCell = (s: SessionRow) =>
    s.status_kehadiran !== "hadir" ? <span className="text-muted-foreground">-</span>
      : s.status_tagihan === "terekap" ? <Pill color="blue">Terekap</Pill>
      : <Pill color="amber">Belum Rekap</Pill>;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 md:flex-row md:items-end">
          <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="Dari"><Input type="date" defaultValue={filters.from} onChange={(e) => e.target.value && setFilter("from", e.target.value)} /></Field>
            <Field label="Sampai"><Input type="date" defaultValue={filters.to} onChange={(e) => e.target.value && setFilter("to", e.target.value)} /></Field>
            <Field label="Tentor">
              <select className={selectClass} value={filters.tutor} onChange={(e) => setFilter("tutor", e.target.value)}>
                <option value="">Semua</option>
                {tutors.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={selectClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">Semua</option>
                {Object.entries(KEHADIRAN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>
          <Button onClick={() => setCreating(true)} className="h-9"><Plus /> Buat Jadwal</Button>
        </div>
      )}

      {sessions.length === 0 ? (
        <EmptyState title="Tidak ada jadwal" desc={isAdmin ? "Ubah rentang tanggal atau buat jadwal baru." : "Belum ada jadwal les untuk Anda di rentang ini."} />
      ) : (
        <>
          {isAdmin && (
            <div className="hidden md:block">
              <DataTable head={["Waktu Les", "Siswa & Kelas", "Program", "Tentor", "Kehadiran & Bukti", "Tagihan (Admin)", ""]}>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <p className="font-semibold whitespace-nowrap">{tanggal(s.mulai_at)}</p>
                      <p className="text-xs text-muted-foreground">{jam(s.mulai_at)} - {jam(s.selesai_at)}</p>
                    </Td>
                    <Td>
                      <p className="font-semibold">{s.students?.nama}</p>
                      <p className="text-xs text-muted-foreground">{s.students?.kelas}</p>
                    </Td>
                    <Td>{s.programs?.nama}</Td>
                    <Td>{s.profiles?.nama}</Td>
                    <Td>{kehadiranCell(s)}</Td>
                    <Td>{tagihanCell(s)}</Td>
                    <Td>
                      {s.status_tagihan === "belum_rekap" && (
                        <div className="flex gap-1">
                          <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(s)}><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Ubah kehadiran" onClick={() => setOverriding(s)}><ShieldCheck /></Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}

          <div className={isAdmin ? "space-y-5 md:hidden" : "space-y-5"}>
            {groups.map(([day, list]) => (
              <section key={day} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{tanggal(list[0].mulai_at)}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((s) => (
                    <div key={s.id} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                            <Clock className="size-4" /> {jam(s.mulai_at)} - {jam(s.selesai_at)}
                          </p>
                          <p className="mt-1 font-semibold">{s.students?.nama} <span className="font-normal text-muted-foreground">• {s.students?.kelas}</span></p>
                          <p className="text-sm text-muted-foreground">{s.programs?.nama}{isAdmin && ` • ${s.profiles?.nama}`}</p>
                        </div>
                        {isAdmin && tagihanCell(s)}
                      </div>
                      {kehadiranCell(s)}
                      {s.absen_at && <p className="text-xs text-muted-foreground">Absen: {tanggalJam(s.absen_at)} WIB (waktu server)</p>}
                      {absenButton(s, true)}
                      {isAdmin && s.status_tagihan === "belum_rekap" && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil /> Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setOverriding(s)}><ShieldCheck /> Kehadiran</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {creating && <CreateDialog tutors={tutors} studentPrograms={studentPrograms} onClose={() => setCreating(false)} />}
      {editing && <EditDialog s={editing} tutors={tutors} onClose={() => setEditing(null)} />}
      {overriding && <OverrideDialog s={overriding} onClose={() => setOverriding(null)} />}
      {photo && <PhotoDialog s={photo} onClose={() => setPhoto(null)} />}
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

function CreateDialog({ tutors, studentPrograms, onClose }: { tutors: { id: string; nama: string }[]; studentPrograms: StudentProgramOpt[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [spId, setSpId] = useState("");
  const [tutorId, setTutorId] = useState("");
  const [tgl, setTgl] = useState("");
  const [mulai, setMulai] = useState("16:00");
  const [selesai, setSelesai] = useState("17:00");
  const [ulang, setUlang] = useState(1);

  return (
    <FormDialog title="Buat Jadwal" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Siswa & program *" className="sm:col-span-2">
          <select
            className={selectClass}
            value={spId}
            onChange={(e) => {
              setSpId(e.target.value);
              const sp = studentPrograms.find((x) => x.id === e.target.value);
              if (sp?.tutor_id) setTutorId(sp.tutor_id);
            }}
          >
            <option value="">Pilih...</option>
            {studentPrograms
              .slice()
              .sort((a, b) => a.students.nama.localeCompare(b.students.nama))
              .map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.students.nama} — {sp.programs?.nama}</option>
              ))}
          </select>
        </Field>
        <Field label="Tentor *" className="sm:col-span-2" hint="Otomatis terisi tentor pengampu, bisa diganti.">
          <select className={selectClass} value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            <option value="">Pilih tentor</option>
            {tutors.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </Field>
        <Field label="Tanggal *"><Input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} /></Field>
        <Field label="Ulang mingguan" hint="Jumlah minggu (1 = sekali)">
          <Input type="number" min={1} max={12} value={ulang} onChange={(e) => setUlang(Number(e.target.value))} />
        </Field>
        <Field label="Jam mulai (WIB)"><Input type="time" value={mulai} onChange={(e) => setMulai(e.target.value)} /></Field>
        <Field label="Jam selesai (WIB)"><Input type="time" value={selesai} onChange={(e) => setSelesai(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await createSessions({ student_program_id: spId, tutor_id: tutorId, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai, ulang_minggu: ulang });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >{pending ? "Menyimpan..." : "Simpan"}</Button>
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
  return (
    <FormDialog title="Edit Jadwal" desc={`${s.students?.nama} — ${s.programs?.nama}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tentor" className="sm:col-span-3">
          <select className={selectClass} value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            {tutors.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </Field>
        <Field label="Tanggal"><Input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} /></Field>
        <Field label="Mulai"><Input type="time" value={mulai} onChange={(e) => setMulai(e.target.value)} /></Field>
        <Field label="Selesai"><Input type="time" value={selesai} onChange={(e) => setSelesai(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await updateSession({ id: s.id, tutor_id: tutorId, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >Simpan</Button>
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
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as SessionRow["status_kehadiran"])}>
          <option value="hadir">Hadir (absen manual)</option>
          <option value="tidak_hadir">Tidak Hadir</option>
          <option value="batal">Batal</option>
          <option value="terjadwal">Reset ke Terjadwal (tentor bisa absen ulang)</option>
        </select>
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

function PhotoDialog({ s, onClose }: { s: SessionRow; onClose: () => void }) {
  return (
    <FormDialog title="Foto Bukti Hadir" desc={`${s.students?.nama} • ${s.profiles?.nama ?? ""}`} onClose={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fileHref(s.foto_file_id!)} alt="Foto bukti hadir" className="w-full rounded-lg border" loading="lazy" />
      <div className="space-y-1 text-sm">
        <p><b>Waktu absen (server):</b> {tanggalJam(s.absen_at)} WIB</p>
        <p><b>Jadwal:</b> {tanggal(s.mulai_at)} {jam(s.mulai_at)} - {jam(s.selesai_at)}</p>
        {s.lat != null && s.lng != null && (
          <a
            href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <MapPin className="size-4" /> Lihat lokasi di peta (akurasi ±{Math.round(s.akurasi_m ?? 0)} m)
          </a>
        )}
      </div>
    </FormDialog>
  );
}
