"use client";
// Resource Timeline (admin, desktop): baris = tentor (dikelompokkan per mapel), kolom = hari.
// Kolom kiri & header menempel (sticky); kotak sesi diwarnai per mapel program.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Ban, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/app/table-kit";
import { jam, siswaLabel } from "@/lib/format";
import type { MapelKey } from "@/lib/mapel";
import { useMapel } from "@/components/app/mapel-context";
import { BULAN_PENDEK, HARI_PENDEK, daysBetween, rangeLabel, ymdWib, type TimelineView } from "@/lib/timeline-range";
import { layoutLanes } from "@/lib/session-conflicts";
import { cn } from "@/lib/utils";
import type { SessionRow, TimelineTutor } from "@/server/services/sessions";
import { visualStatus, type VisualStatus } from "./session-detail";

export type TimelineNavState = { view: TimelineView; anchor: string; from: string; to: string };

const laneClusters = (items: SessionRow[]) => layoutLanes(items, (s) => ({ start: new Date(s.mulai_at).getTime(), end: new Date(s.selesai_at).getTime() }));
const shortKelas = (k: string | null | undefined) => (k ?? "").replace(/^kelas\s+/i, "");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function StatusIcon({ vs, small }: { vs: VisualStatus; small?: boolean }) {
  const box = small ? "size-3" : "size-4";
  switch (vs) {
    case "hadir":
      return (
        <span role="img" aria-label="Sudah absen" title="Sudah absen" className={cn("flex shrink-0 items-center justify-center rounded-full bg-green-600 text-white", box)}>
          <Check className={small ? "size-2" : "size-2.5"} strokeWidth={4} />
        </span>
      );
    case "belum_absen":
      return (
        <span role="img" aria-label="Belum absen" title="Belum absen" className={cn("flex shrink-0 items-center justify-center rounded-full bg-red-600 font-bold text-white", box, small ? "text-[8px]" : "text-[10px]")}>
          !
        </span>
      );
    case "tidak_hadir":
      return (
        <span role="img" aria-label="Tidak hadir" title="Tidak hadir" className={cn("flex shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600", box)}>
          <X className={small ? "size-2" : "size-2.5"} strokeWidth={4} />
        </span>
      );
    case "batal":
      return <Ban role="img" aria-label="Batal" className={cn("shrink-0 text-slate-400", box)} />;
    default:
      return <span role="img" aria-label="Terjadwal" title="Terjadwal" className={cn("shrink-0 rounded-full bg-slate-400", small ? "size-1.5" : "size-2")} />;
  }
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-label="Arti ikon status">
      <span className="inline-flex items-center gap-1.5"><StatusIcon vs="hadir" small /> Sudah absen</span>
      <span className="inline-flex items-center gap-1.5"><StatusIcon vs="belum_absen" small /> Belum absen</span>
      <span className="inline-flex items-center gap-1.5"><StatusIcon vs="terjadwal" small /> Terjadwal</span>
      <span className="inline-flex items-center gap-1.5" title="Tentor/siswa sama dengan waktu beririsan (kelas kelompok tidak dihitung)"><AlertTriangle className="size-3.5 text-amber-600" /> Bentrok</span>
    </div>
  );
}

export function TimelineNav({ nav, today, onNavigate, className, trailing }: { nav: TimelineNavState; today: string; onNavigate: (p: { view?: TimelineView; tgl?: string; dir?: 1 | -1 }) => void; className?: string; trailing?: ReactNode }) {
  const inRange = today >= nav.from && today <= nav.to;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="order-1 inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Tampilan">
        {(["minggu", "bulan"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={nav.view === v}
            onClick={() => nav.view !== v && onNavigate({ view: v })}
            className={cn("rounded-md px-3 py-1 text-sm font-medium transition-colors", nav.view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {v === "minggu" ? "Mingguan" : "Bulanan"}
          </button>
        ))}
      </div>
      <div className="order-3 inline-flex items-center gap-1">
        <Button size="icon-sm" variant="outline" aria-label={nav.view === "minggu" ? "Minggu sebelumnya" : "Bulan sebelumnya"} onClick={() => onNavigate({ dir: -1 })}>
          <ChevronLeft />
        </Button>
        <span className="min-w-36 px-1 text-center text-sm font-semibold tabular-nums">{rangeLabel(nav.view, nav.from, nav.to)}</span>
        <Button size="icon-sm" variant="outline" aria-label={nav.view === "minggu" ? "Minggu berikutnya" : "Bulan berikutnya"} onClick={() => onNavigate({ dir: 1 })}>
          <ChevronRight />
        </Button>
      </div>
      <Button size="sm" variant="outline" className="order-4" disabled={inRange} onClick={() => onNavigate({ tgl: today })}>
        {nav.view === "minggu" ? "Minggu ini" : "Bulan ini"}
      </Button>
      {trailing}
    </div>
  );
}

export function Timeline({
  sessions,
  tutors,
  counts,
  conflictIds,
  nav,
  now,
  canManage,
  onNavigate,
  onCreate,
  onOpen,
  single = false,
}: {
  sessions: SessionRow[];
  tutors: TimelineTutor[];
  counts: Record<string, number>;
  /** Id sesi yang bentrok dengan sesi lain (dihitung di ScheduleView). */
  conflictIds: Set<string>;
  nav: TimelineNavState;
  now: number;
  canManage: boolean;
  onNavigate: (p: { view?: TimelineView; tgl?: string; dir?: 1 | -1 }) => void;
  onCreate: (init?: { tutorId?: string; tgl?: string }) => void;
  onOpen: (s: SessionRow) => void;
  /** Satu tentor (akun tentor melihat jadwalnya sendiri): tanpa kolom & kelompok tentor, tanpa cari/saring tentor. */
  single?: boolean;
}) {
  const { list: cats, active: activeCats, of: mapelOf } = useMapel();
  const [tutorQ, setTutorQ] = useState("");
  const [studentQ, setStudentQ] = useState("");
  const [mapelSel, setMapelSel] = useState<Set<MapelKey>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<MapelKey>>(new Set());

  const today = ymdWib(now);
  const monthly = nav.view === "bulan";
  const days = useMemo(() => daysBetween(nav.from, nav.to), [nav.from, nav.to]);
  const narrowing = studentQ.trim() !== "" || mapelSel.size > 0;

  // Sesi yang lolos filter mapel (pill) & cari murid, dikelompokkan per sel (tentor × hari)
  const cells = useMemo(() => {
    const sq = studentQ.trim().toLowerCase();
    const map = new Map<string, SessionRow[]>();
    const perTutor = new Map<string, number>();
    for (const s of sessions) {
      if (mapelSel.size && !mapelSel.has(mapelOf(s.programs?.mapel).key)) continue;
      if (sq && !`${s.students?.nama ?? ""} ${s.students?.panggilan ?? ""} ${s.students?.kelas ?? ""}`.toLowerCase().includes(sq)) continue;
      const k = `${s.tutor_id}|${ymdWib(s.mulai_at)}`;
      map.set(k, [...(map.get(k) ?? []), s]);
      if (s.status_kehadiran !== "batal") perTutor.set(s.tutor_id, (perTutor.get(s.tutor_id) ?? 0) + 1);
    }
    return { map, perTutor };
  }, [sessions, mapelSel, studentQ, mapelOf]);

  // Tentor yang tampil: aktif (atau masih punya sesi di rentang ini) + lolos pencarian & toggle kosong
  const groups = useMemo(() => {
    const tq = tutorQ.trim().toLowerCase();
    const withSessions = new Set(sessions.map((s) => s.tutor_id));
    const visible = tutors.filter((t) => {
      if (!t.aktif && !withSessions.has(t.id)) return false;
      if (tq && !t.nama.toLowerCase().includes(tq)) return false;
      if (!single && (hideEmpty || narrowing) && !(cells.perTutor.get(t.id) ?? 0)) return false;
      return true;
    });
    // tentor dengan kategori tak dikenal/nonaktif-terhapus jatuh ke "lainnya" (mapelOf)
    return cats.map((m) => ({ m, list: visible.filter((t) => mapelOf(t.mapel).key === m.key) })).filter((g) => g.list.length);
  }, [tutors, tutorQ, hideEmpty, narrowing, cells, sessions, cats, mapelOf, single]);

  const conflictByTutor = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) if (conflictIds.has(s.id)) m.set(s.tutor_id, (m.get(s.tutor_id) ?? 0) + 1);
    return m;
  }, [sessions, conflictIds]);

  const totalVisible = groups.reduce((a, g) => a + g.list.length, 0);
  const monthNow = today.slice(0, 7);
  const countMonth = nav.anchor.slice(0, 7);
  const [cy, cm] = countMonth.split("-").map(Number);
  const countLabel = (n: number) => (countMonth === monthNow ? `${n} Sesi bulan ini` : `${n} Sesi · ${BULAN_PENDEK[cm - 1]} ${cy}`);

  const toggleMapel = (k: MapelKey) =>
    setMapelSel((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleGroup = (k: MapelKey) =>
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const colW = single
    ? monthly
      ? "min-w-[2.75rem]"
      : "min-w-[6.75rem] md:min-w-0"
    : monthly
      ? "min-w-[3rem] md:min-w-[3.25rem]"
      : "min-w-[5.75rem] md:min-w-[7.5rem]";

  // Tampilan bulanan lebar: geser otomatis supaya kolom hari ini terlihat
  const todayRef = useRef<HTMLTableCellElement | null>(null);
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [monthly, nav.from]);

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Navigasi periode + aksi utama */}
      <TimelineNav
        nav={nav}
        today={today}
        onNavigate={onNavigate}
        trailing={
          canManage && (
            <Button className="order-2 ml-auto md:order-5" onClick={() => onCreate()}>
              <Plus /> <span className="md:hidden">Tambah</span>
              <span className="hidden md:inline">Tambah Jadwal</span>
            </Button>
          )
        }
      />

      {/* 2. Kode warna = legenda sekaligus filter mapel (desktop: pill satu baris) */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="text-xs font-bold tracking-wider text-muted-foreground" title="Klik warna untuk menyaring jadwal per mapel">
          KODE WARNA <span className="font-normal tracking-normal normal-case">· klik untuk filter</span>
        </span>
        <button
          type="button"
          aria-pressed={mapelSel.size === 0}
          onClick={() => setMapelSel(new Set())}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", mapelSel.size === 0 ? "border-foreground/40 bg-muted ring-2 ring-foreground/15" : "bg-background text-muted-foreground hover:bg-muted")}
        >
          Semua
        </button>
        {activeCats.map((m) => {
          const on = mapelSel.has(m.key);
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              title={m.label}
              onClick={() => toggleMapel(m.key)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-foreground transition", on && "ring-2 ring-offset-1", mapelSel.size > 0 && !on && "opacity-50 hover:opacity-100")}
              style={{ background: m.bg, borderColor: `${m.dot}66`, ...(on ? { ["--tw-ring-color" as string]: m.dot } : {}) }}
            >
              <span className="size-2 rounded-full" style={{ background: m.dot }} aria-hidden />
              {m.short}
            </button>
          );
        })}
      </div>

      {/* 3. Cari + saring */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MapelFilter selected={mapelSel} onToggle={toggleMapel} onReset={() => setMapelSel(new Set())} className="md:hidden" />
        {!single && (
          <label className="flex cursor-pointer items-center gap-2 text-sm select-none md:order-3">
            <input type="checkbox" role="switch" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            <span className="md:hidden">Sembunyikan kosong</span>
            <span className="hidden md:inline">Sembunyikan tentor kosong</span>
          </label>
        )}
        {!single && <SearchBox value={tutorQ} onChange={setTutorQ} placeholder="Cari tentor…" className="basis-[calc(50%-0.375rem)] md:order-1 md:max-w-56 md:flex-none md:basis-auto" />}
        <SearchBox value={studentQ} onChange={setStudentQ} placeholder="Cari murid…" className={single ? "md:max-w-72" : "basis-[calc(50%-0.375rem)] md:order-2 md:max-w-56 md:flex-none md:basis-auto"} />
      </div>

      {/* 4. Filter aktif (HP) + arti ikon, tepat di atas grid */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {[...mapelSel].map((k) => {
          const m = mapelOf(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleMapel(k)}
              aria-label={`Hapus filter ${m.label}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium md:hidden"
              style={{ background: m.bg, borderColor: `${m.dot}66` }}
            >
              <span className="size-2 rounded-full" style={{ background: m.dot }} aria-hidden />
              {m.short}
              <X className="size-3" />
            </button>
          );
        })}
        <div className="md:ml-auto">
          <Legend />
        </div>
      </div>

      {single && sessions.length === 0 && (
        <p className="rounded-lg border border-dashed bg-card/60 p-3 text-center text-sm text-muted-foreground">Belum ada jadwal les pada periode ini.</p>
      )}
      {totalVisible === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {tutors.length === 0 ? "Belum ada tentor." : "Tidak ada tentor yang cocok dengan filter ini."}
        </div>
      ) : (
        <div className="max-h-[calc(100dvh-15rem)] overflow-auto rounded-xl border bg-card md:max-h-[calc(100dvh-19rem)]">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {!single && (
                  <th className="sticky top-0 left-0 z-30 w-24 min-w-24 md:w-52 md:min-w-52 border-r border-b bg-white px-2 py-2.5 text-left text-[10px] font-semibold md:px-3 md:text-xs tracking-wide text-muted-foreground uppercase">
                    Tentor <span className="font-normal normal-case">({totalVisible})</span>
                  </th>
                )}
                {days.map((d) => {
                  const dt = new Date(`${d}T00:00:00Z`);
                  const isToday = d === today;
                  const weekend = dt.getUTCDay() === 0;
                  return (
                    <th
                      key={d}
                      ref={isToday ? todayRef : undefined}
                      className={cn("sticky top-0 z-20 border-b border-l bg-white px-1 py-2 text-center", colW, isToday && "bg-blue-100", weekend && !isToday && "bg-slate-100")}
                    >
                      <div className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>{HARI_PENDEK[dt.getUTCDay()]}</div>
                      <div className={cn("tabular-nums", monthly ? "text-sm font-bold" : "text-sm font-bold")}>
                        {Number(d.slice(8))}
                        {!monthly && <span className="font-medium text-muted-foreground"> {BULAN_PENDEK[Number(d.slice(5, 7)) - 1]}</span>}
                      </div>
                      {isToday && !monthly && <div className="text-[10px] font-bold tracking-wider text-primary">HARI INI</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map(({ m, list }) => {
                const closed = collapsed.has(m.key);
                return (
                  <Fragment key={m.key}>
                    {!single && (
                    <tr>
                      <td colSpan={days.length + 1} className="border-b bg-muted/70 p-0">
                        <button
                          type="button"
                          aria-expanded={!closed}
                          onClick={() => toggleGroup(m.key)}
                          className="sticky left-0 flex w-fit items-center gap-2 px-3 py-2 text-sm font-semibold hover:text-primary"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", closed && "-rotate-90")} />
                          <span className="size-2.5 rounded-full" style={{ background: m.dot }} aria-hidden />
                          {m.label} <span className="font-normal text-muted-foreground">({list.length} Tentor)</span>
                        </button>
                      </td>
                    </tr>
                    )}
                    {(!closed || single) &&
                      list.map((t) => (
                        <tr key={t.id}>
                          {!single && (
                          <td className="sticky left-0 z-10 w-24 min-w-24 md:w-52 md:min-w-52 border-r border-b bg-white px-2 py-2 align-top md:px-3">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="hidden size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold md:flex"
                                style={{ background: m.bg, borderColor: `${m.dot}88`, color: m.dot }}
                                aria-hidden
                              >
                                {initials(t.nama)}
                              </span>
                              <div className="min-w-0">
                                <p className={cn("line-clamp-2 text-xs leading-tight font-semibold break-words md:truncate md:text-sm", !t.aktif && "text-muted-foreground")} title={t.nama}>
                                  {t.nama}
                                  {!t.aktif && <span className="ml-1 text-[10px] font-normal">(nonaktif)</span>}
                                </p>
                                <span
                                  className="mt-0.5 hidden items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium md:inline-flex"
                                  style={{ background: m.bg, borderColor: `${m.dot}55` }}
                                >
                                  <span className="size-1.5 rounded-full" style={{ background: m.dot }} aria-hidden />
                                  {m.label}
                                </span>
                                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground tabular-nums md:text-[11px]">{countLabel(counts[t.id] ?? 0)}</p>
                                {(conflictByTutor.get(t.id) ?? 0) > 0 && (
                                  <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight font-medium text-amber-700 md:text-[11px]">
                                    <AlertTriangle className="size-3 shrink-0" /> {conflictByTutor.get(t.id)} sesi bentrok
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          )}
                          {days.map((d) => {
                            const here = cells.map.get(`${t.id}|${d}`) ?? [];
                            const isToday = d === today;
                            const weekend = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
                            const shown = monthly ? here.slice(0, 4) : here;
                            return (
                              <td
                                key={d}
                                className={cn("relative border-b border-l align-top", monthly ? (single ? "h-16 p-0.5" : "h-12 p-0.5") : single ? "h-32 p-1.5" : "h-[4.5rem] p-1", colW, isToday ? "bg-blue-50" : weekend && "bg-muted/40")}
                              >
                                {canManage && (
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label={`Tambah jadwal ${t.nama} ${d}`}
                                    title="Klik untuk tambah jadwal"
                                    onClick={() => onCreate({ tutorId: t.id, tgl: d })}
                                    className="group/cell absolute inset-0 flex items-center justify-center text-primary/0 transition-colors hover:bg-primary/5 hover:text-primary/60"
                                  >
                                    {!here.length && <Plus className="size-4" />}
                                  </button>
                                )}
                                <div className={cn("pointer-events-none relative flex flex-col", monthly ? "gap-0.5" : "gap-1")}>
                                  {monthly
                                    ? shown.map((s) => <Chip key={s.id} s={s} now={now} onOpen={onOpen} conflict={conflictIds.has(s.id)} />)
                                    : laneClusters(here).map((lanes) => (
                                        // Sesi beririsan → jalur berdampingan (desktop); di HP tetap bertumpuk
                                        <div key={lanes[0][0].id} className="flex flex-col gap-1 md:flex-row">
                                          {lanes.map((lane) => (
                                            <div key={lane[0].id} className="flex min-w-0 flex-1 flex-col gap-1">
                                              {lane.map((s) => (
                                                <Box key={s.id} s={s} now={now} onOpen={onOpen} conflict={conflictIds.has(s.id)} narrow={lanes.length > 1} />
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                  {monthly && here.length > shown.length && (
                                    <button
                                      type="button"
                                      onClick={() => onNavigate({ view: "minggu", tgl: d })}
                                      className="pointer-events-auto rounded text-[10px] font-medium text-primary hover:underline"
                                    >
                                      +{here.length - shown.length} lagi
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** HP: pengganti deretan pill — satu tombol yang membuka daftar mapel berwarna (centang untuk menyaring). */
function MapelFilter({ selected, onToggle, onReset, className }: { selected: Set<MapelKey>; onToggle: (k: MapelKey) => void; onReset: () => void; className?: string }) {
  const { active: activeCats, of: mapelOf } = useMapel();
  const n = selected.size;
  const dots = (n ? [...selected] : activeCats.slice(0, 4).map((m) => m.key)).slice(0, 4);
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn("inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted/40 data-[popup-open]:border-ring", n > 0 && "border-primary/50 bg-primary/5", className)}
      >
        <span className="flex -space-x-1" aria-hidden>
          {dots.map((k) => (
            <span key={k} className="size-3 rounded-full border border-white" style={{ background: mapelOf(k).dot }} />
          ))}
        </span>
        {n ? `${n} mapel` : "Semua mapel"}
        <ChevronDown className="size-4 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-[60]">
          <Popover.Popup className="w-64 origin-[var(--transform-origin)] rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">Tampilkan jadwal mapel:</p>
            <ul>
              {activeCats.map((m) => (
                <li key={m.key}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selected.has(m.key)} onChange={() => onToggle(m.key)} />
                    <span className="size-3 rounded-full" style={{ background: m.dot }} aria-hidden />
                    {m.label}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex justify-end border-t pt-2">
              <Button size="sm" variant="ghost" disabled={n === 0} onClick={onReset}>
                Reset
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Kotak sesi (tampilan mingguan): jam + nama siswa & kelas; mapel diwakili warna. */
function Box({ s, now, onOpen, conflict, narrow = false }: { s: SessionRow; now: number; onOpen: (s: SessionRow) => void; conflict: boolean; /** berbagi lebar sel dengan sesi lain (desktop) */ narrow?: boolean }) {
  const { of: mapelOf } = useMapel();
  const m = mapelOf(s.programs?.mapel);
  const vs = visualStatus(s, now);
  const label = `${jam(s.mulai_at)} – ${jam(s.selesai_at)} ${siswaLabel(s.students)}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      title={`${conflict ? "⚠ BENTROK • " : ""}${label}${s.students?.kelas ? ` (${s.students.kelas})` : ""} • ${s.programs?.nama ?? ""}`}
      className={cn(
        "pointer-events-auto w-full rounded-md border border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-snug md:text-xs shadow-xs transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        vs === "batal" && "opacity-50",
        conflict && "ring-2 ring-amber-500",
      )}
      style={{ background: m.bg, borderColor: `${m.dot}55`, borderLeftColor: m.dot }}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={cn("font-semibold whitespace-nowrap tabular-nums", vs === "batal" && "line-through")}>
          {narrow ? (
            <>
              <span className="md:hidden">
                {jam(s.mulai_at)} – {jam(s.selesai_at)}
              </span>
              <span className="hidden md:inline">{jam(s.mulai_at)}</span>
            </>
          ) : (
            <>
              {jam(s.mulai_at)} – {jam(s.selesai_at)}
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          {conflict && <AlertTriangle className={cn("size-3.5 text-amber-600", narrow && "md:hidden")} aria-label="Bentrok jadwal" />}
          <StatusIcon vs={vs} />
        </span>
      </span>
      <span className={cn("block truncate", vs === "batal" && "line-through")}>
        {siswaLabel(s.students)}
        {s.students?.kelas && <span className={cn("text-foreground/60", narrow && "md:hidden")}> ({shortKelas(s.students.kelas)})</span>}
      </span>
    </button>
  );
}

/** Chip ringkas (tampilan bulanan): hanya jam mulai + ikon status. */
function Chip({ s, now, onOpen, conflict }: { s: SessionRow; now: number; onOpen: (s: SessionRow) => void; conflict: boolean }) {
  const { of: mapelOf } = useMapel();
  const m = mapelOf(s.programs?.mapel);
  const vs = visualStatus(s, now);
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      title={`${conflict ? "⚠ BENTROK • " : ""}${jam(s.mulai_at)} – ${jam(s.selesai_at)} • ${siswaLabel(s.students)}${s.students?.kelas ? ` (${s.students.kelas})` : ""} • ${s.programs?.nama ?? ""}`}
      className={cn("pointer-events-auto flex w-full items-center justify-between gap-0.5 rounded border border-l-2 px-1 py-px text-[10px] leading-tight font-semibold tabular-nums hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", vs === "batal" && "line-through opacity-50", conflict && "ring-2 ring-amber-500")}
      style={{ background: m.bg, borderColor: `${m.dot}55`, borderLeftColor: m.dot }}
    >
      {jam(s.mulai_at)}
      <StatusIcon vs={vs} small />
    </button>
  );
}
