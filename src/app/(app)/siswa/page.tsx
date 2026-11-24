import { requireAccessOrTutor } from "@/lib/auth";
import { can, levelOf } from "@/lib/access";
import { PageHeader } from "@/components/app/ui";
import { listStudents } from "@/server/services/students";
import { programOptions, tutorOptions } from "@/server/services/master";
import { StudentsView, type StudentPerm } from "./students-view";

export const metadata = { title: "Data Siswa" };

export default async function SiswaPage() {
  const me = await requireAccessOrTutor("siswa");
  const perm: StudentPerm = {
    viewAll: can(me, "siswa", "read"),
    manage: can(me, "siswa", "write"),
    asesmen: levelOf(me, "asesmen"),
  };

  // Service menerapkan hak akses: tanpa akses Siswa (tentor) hanya siswanya; asesmen hanya bila berhak.
  const [students, programs, tutors] = await Promise.all([
    listStudents(me),
    perm.viewAll ? programOptions(me) : Promise.resolve([]),
    perm.viewAll ? tutorOptions(me) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={perm.viewAll ? "Data Siswa" : "Siswa Bimbingan Saya"}
        desc={perm.viewAll ? "Master biodata siswa, program, tentor pengampu, dan dokumen asesmen ABK." : "Siswa yang Anda ampu beserta program dan jadwalnya."}
      />
      <StudentsView perm={perm} students={students} programs={programs} tutors={tutors} />
    </>
  );
}
