import { can } from "@/lib/access";
import Link from "next/link";
import { FolderUp } from "lucide-react";
import { requireAccessOrTutor, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { listSessions } from "@/server/services/sessions";
import { studentProgramOptions, tutorOptions } from "@/server/services/master";
import { ScheduleView } from "./schedule-view";

export const metadata = { title: "Jadwal & Absensi" };

function todayWib(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function JadwalPage({ searchParams }: PageProps<"/jadwal">) {
  const profile = await requireAccessOrTutor("jadwal");
  const perm = { viewAll: can(profile, "jadwal", "read"), manage: can(profile, "jadwal", "write") };
  const isAdmin = perm.viewAll;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const filters = {
    from: ymd(str("from")) || todayWib(isAdmin ? -14 : -7),
    to: ymd(str("to")) || todayWib(14),
    tutor: str("tutor"),
    status: str("status"),
    student: str("student"),
  };

  const [sessions, settings, tutors, studentPrograms] = await Promise.all([
    listSessions(profile, filters),
    getSettings(),
    perm.viewAll ? tutorOptions(profile) : Promise.resolve([]),
    perm.manage ? studentProgramOptions(profile) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={isAdmin ? "Jadwal & Absensi" : "Jadwal Saya"}
        desc={
          isAdmin
            ? "Semua jadwal les, bukti foto kehadiran, dan status rekap tagihan."
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
        filters={filters}
        tutors={tutors}
        studentPrograms={studentPrograms}
        window={{ buka: settings.absen_buka_menit, tutup: settings.absen_tutup_menit }}
      />
    </>
  );
}

export type StudentProgramOpt = Awaited<ReturnType<typeof studentProgramOptions>>[number];
