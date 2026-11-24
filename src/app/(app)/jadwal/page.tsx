import { can } from "@/lib/access";
import Link from "next/link";
import { FolderUp } from "lucide-react";
import { requireAccessOrTutor, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { listSessions, monthSessionCounts, ownTimelineTutor, timelineTutors } from "@/server/services/sessions";
import { studentProgramOptions } from "@/server/services/master";
import { rangeFor, type TimelineView } from "@/lib/timeline-range";
import { ScheduleView } from "./schedule-view";

export const metadata = { title: "Jadwal & Absensi" };

function todayWib(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** Waktu server saat render (nilai awal jam di klien supaya hydration identik). */
const nowMs = () => Date.now();

const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function JadwalPage({ searchParams }: PageProps<"/jadwal">) {
  const profile = await requireAccessOrTutor("jadwal");
  const perm = { viewAll: can(profile, "jadwal", "read"), manage: can(profile, "jadwal", "write") };
  const isAdmin = perm.viewAll;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  // Semua akun memakai Resource Timeline (mingguan/bulanan, ?view= & ?tgl=): admin melihat semua tentor, tentor hanya dirinya.
  const view: TimelineView = str("view") === "bulan" ? "bulan" : "minggu";
  const anchor = ymd(str("tgl")) || todayWib();
  const nav = { view, anchor, ...rangeFor(view, anchor) };

  const filters = { from: nav.from, to: nav.to, tutor: str("tutor"), status: str("status"), student: str("student"), limit: 5000 };

  const [sessions, settings, tutors, counts, studentPrograms] = await Promise.all([
    listSessions(profile, filters),
    getSettings(),
    perm.viewAll ? timelineTutors(profile) : ownTimelineTutor(profile),
    monthSessionCounts(profile, anchor),
    perm.manage ? studentProgramOptions(profile) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={isAdmin ? "Jadwal & Absensi" : "Jadwal Saya"}
        desc={
          isAdmin
            ? "Resource timeline: jadwal semua tentor per hari, bukti kehadiran, dan status absen."
            : "Tekan Absen saat les dimulai. Kamera & lokasi wajib aktif."
        }
        actions={
          settings.link_drive_konten ? (
            <Link
              href={settings.link_drive_konten}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "secondary" })}
            >
              <FolderUp /> Kirim Video Konten (Google Drive)
            </Link>
          ) : null
        }
      />
      <ScheduleView
        perm={perm}
        me={{ id: profile.id, nama: profile.nama }}
        sessions={sessions}
        nav={nav}
        counts={counts}
        tutors={tutors}
        studentPrograms={studentPrograms}
        serverNow={nowMs()}
        window={{ buka: settings.absen_buka_menit, tutup: settings.absen_tutup_menit, bebas: settings.absen_susulan_bebas }}
      />
    </>
  );
}

export type StudentProgramOpt = Awaited<ReturnType<typeof studentProgramOptions>>[number];
