"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Plus, Camera, MapPin, Pencil, ShieldCheck, Clock, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, Td, Pill, EmptyState, KEHADIRAN } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { AppSelect } from "@/components/app/app-select";
import { fileHref } from "@/components/app/file-link";
import { tanggal, jam, tanggalJam, TZ } from "@/lib/format";
import { createSessions, updateSession, setAttendanceStatus } from "./actions";
import { CameraAttendance } from "./camera-attendance";
import type { StudentProgramOpt } from "./page";
import type { SessionRow } from "@/server/services/sessions";
import { DatePicker, TimePicker } from "@/components/app/date-picker";

export type { SessionRow };

type Win = { buka: number; tutup: number };

const sessionSearchText = (s: SessionRow) =>
  `${s.students?.nama} ${s.students?.kelas ?? ""} ${s.programs?.nama} ${s.profiles?.nama} ${KEHADIRAN[s.status_kehadiran].label}`;

function inWindow(s: SessionRow, w: Win, now: number) {
  return now >= new Date(s.mulai_at).getTime() - w.buka * 60_000 && now <= new Date(s.selesai_at).getTime() + w.tutup * 60_000;
}

/** "YYYY-MM-DD" & "HH:mm" WIB dari ISO, untuk form edit */
function wibParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
  return { tanggal: d.slice(0, 10), jam: d.slice(11, 16) };
}

export function ScheduleView({
  perm, me, sessions, filters, tutors, studentPrograms, window: win,
}: {
  /** viewAll = akses Jadwal (Lihat); manage = akses Jadwal (Kelola). */
  perm: { viewAll: boolean; manage: boolean };
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

  // Cari (siswa/tentor/program/kelas) + paging, lalu kelompokkan per tanggal untuk kartu
  const list = useClientList(sessions, sessionSearchText);
  const pageRows = list.rows;
  const groups = useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    for (const s of pageRows) {
      const k = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(s.mulai_at));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [pageRows]);

  const absenButton = (s: SessionRow, big = false) => {
    if (s.tutor_id !== me.id || s.status_kehadiran !== "terjadwal") return null;
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
        <Button size="sm" variant="outline" onClick={() => setPhoto(s)}>
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
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder={perm.viewAll ? "Cari siswa, tentor, program, atau kelas..." : "Cari siswa atau program..."} />
        {perm.manage && <Button onClick={() => setCreating(true)}><Plus /> Buat Jadwal</Button>}
      </Toolbar>
      {perm.viewAll && (
        <div className="rounded-xl border bg-card p-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Dari"><DatePicker aria-label="Dari tanggal" value={filters.from} max={filters.to || undefined} onChange={(v) => v && setFilter("from", v)} /></Field>
            <Field label="Sampai"><DatePicker aria-label="Sampai tanggal" value={filters.to} min={filters.from || undefined} onChange={(v) => v && setFilter("to", v)} /></Field>
            <Field label="Tentor">
              <AppSelect value={filters.tutor} onChange={(v) => setFilter("tutor", v)} aria-label="Tentor"
                options={[{ value: "", label: "Semua tentor" }, ...tutors.map((t) => ({ value: t.id, label: t.nama }))]} />
            </Field>
            <Field label="Status">
              <AppSelect value={filters.status} onChange={(v) => setFilter("status", v)} aria-label="Status"
                options={[{ value: "", label: "Semua status" }, ...Object.entries(KEHADIRAN).map(([k, v]) => ({ value: k, label: v.label }))]} />
            </Field>
          </div>
        </div>
      )}

      {list.total === 0 ? (
        <EmptyState title="Tidak ada jadwal" desc={perm.viewAll ? "Ubah rentang tanggal atau buat jadwal baru." : "Belum ada jadwal les untuk Anda di rentang ini."} />
      ) : (
        <>
          {perm.viewAll && (
            <div className="hidden md:block">
              <DataTable head={["Waktu Les", "Siswa & Kelas", "Program", "Tentor", "Kehadiran & Bukti", "Tagihan", ""]}>
                {pageRows.map((s) => (
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
                      <div className="flex flex-col items-start gap-1.5">
                        {absenButton(s)}
                        {perm.manage && s.status_tagihan === "belum_rekap" && (
                          <div className="flex gap-1">
                            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(s)}><Pencil /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Ubah kehadiran" onClick={() => setOverriding(s)}><ShieldCheck /></Button>
                          </div>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}

          <div className={perm.viewAll ? "space-y-5 md:hidden" : "space-y-5"}>
            {groups.map(([day, daySessions]) => (
              <section key={day} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{tanggal(daySessions[0].mulai_at)}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {daySessions.map((s) => (
                    <div key={s.id} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                            <Clock className="size-4" /> {jam(s.mulai_at)} - {jam(s.selesai_at)}
                          </p>
                          <p className="mt-1 font-semibold">{s.students?.nama} <span className="font-normal text-muted-foreground">• {s.students?.kelas}</span></p>
                          <p className="text-sm text-muted-foreground">{s.programs?.nama}{perm.viewAll && ` • ${s.profiles?.nama}`}</p>
                        </div>
                        {perm.viewAll && tagihanCell(s)}
                      </div>
                      {kehadiranCell(s)}
                      {s.absen_at && <p className="text-xs text-muted-foreground">Absen: {tanggalJam(s.absen_at)} WIB (waktu server)</p>}
                      {absenButton(s, true)}
                      {perm.manage && s.status_tagihan === "belum_rekap" && (
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
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

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
          <AppSelect
            value={spId}
            placeholder="Pilih siswa & program"
            onChange={(v) => {
              setSpId(v);
              const sp = studentPrograms.find((x) => x.id === v);
              if (sp?.tutor_id) setTutorId(sp.tutor_id);
            }}
            options={studentPrograms
              .slice()
              .sort((a, b) => a.students.nama.localeCompare(b.students.nama))
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
          <AppSelect value={tutorId} onChange={setTutorId} options={tutors.map((t) => ({ value: t.id, label: t.nama }))} />
        </Field>
        <Field label="Tanggal"><DatePicker value={tgl} onChange={setTgl} /></Field>
        <Field label="Mulai"><TimePicker aria-label="Jam mulai" value={mulai} onChange={setMulai} /></Field>
        <Field label="Selesai"><TimePicker aria-label="Jam selesai" value={selesai} onChange={setSelesai} /></Field>
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
