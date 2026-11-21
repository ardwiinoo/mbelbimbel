import { isAdminRole } from "@/lib/roles";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listStudents } from "@/server/services/students";
import { programOptions, tutorOptions } from "@/server/services/master";
import { StudentsView } from "./students-view";

export const metadata = { title: "Data Siswa" };

export default async function SiswaPage() {
  const profile = await requireProfile();
  const isAdmin = isAdminRole(profile.role);

  // Service yang menerapkan hak akses: tentor hanya siswanya & tanpa asesmen.
  const [students, programs, tutors] = await Promise.all([
    listStudents(profile),
    isAdmin ? programOptions(profile) : Promise.resolve([]),
    isAdmin ? tutorOptions(profile) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={isAdmin ? "Data Siswa" : "Siswa Bimbingan Saya"}
        desc={
          isAdmin
            ? "Master biodata siswa, program, tentor pengampu, dan dokumen asesmen ABK."
            : "Siswa yang Anda ampu beserta kontak orang tua."
        }
      />
      <StudentsView isAdmin={isAdmin} students={students} programs={programs} tutors={tutors} />
    </>
  );
}
