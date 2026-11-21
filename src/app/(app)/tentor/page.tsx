import { requireAccess } from "@/lib/auth";
import { can } from "@/lib/access";
import { PageHeader } from "@/components/app/ui";
import { listProgramsWithTarif, listTutors } from "@/server/services/master";
import { TutorsTable, ProgramsTable } from "./views";

export const metadata = { title: "Tentor & Tarif" };

export default async function TentorPage() {
  const me = await requireAccess("tentor", "read");
  const canEdit = can(me, "tentor", "write");
  const [tutors, programs] = await Promise.all([listTutors(me), listProgramsWithTarif(me)]);

  return (
    <>
      <PageHeader title="Tentor & Master Tarif" desc="Daftar pengajar dan standar harga per pertemuan untuk kalkulasi invoice otomatis." />
      <div className="space-y-8">
        <TutorsTable tutors={tutors} canEdit={canEdit} canManageAccounts={can(me, "pengguna", "write")} />
        <ProgramsTable programs={programs} canEdit={canEdit} />
      </div>
    </>
  );
}
