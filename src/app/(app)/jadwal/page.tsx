import { isAdminRole } from "@/lib/roles";
import Link from "next/link";
import { FolderUp } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const profile = await requireProfile();
  const isAdmin = isAdminRole(profile.role);
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
    isAdmin ? tutorOptions(profile) : Promise.resolve([]),
    isAdmin ? studentProgramOptions(profile) : Promise.resolve([]),
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
              className={cn(buttonVariants({ variant: "secondary" }), "h-9")}
            >
              <FolderUp /> Kirim Video Konten (Google Drive)
            </Link>
          ) : null
        }
      />
      <ScheduleView
        isAdmin={isAdmin}
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
