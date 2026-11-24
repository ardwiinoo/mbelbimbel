import { requireAccess } from "@/lib/auth";
import { can } from "@/lib/access";
import { PageHeader } from "@/components/app/ui";
import { listProgramsWithTarif, listTutors } from "@/server/services/master";
import { listMapelAdmin } from "@/server/services/mapel";
import { TutorsTable, ProgramsTable } from "./views";
import { MapelSection } from "./mapel-section";

export const metadata = { title: "Tentor & Tarif" };

export default async function TentorPage() {
  const me = await requireAccess("tentor", "read");
  const canEdit = can(me, "tentor", "write");
  const [tutors, programs, mapel] = await Promise.all([listTutors(me), listProgramsWithTarif(me), listMapelAdmin(me)]);

  return (
    <>
      <PageHeader title="Tentor & Master Tarif" desc="Daftar pengajar dan standar harga per pertemuan untuk kalkulasi invoice otomatis." />
      <div className="space-y-8">
        <TutorsTable tutors={tutors} canEdit={canEdit} canManageAccounts={can(me, "pengguna", "write")} showHonor={can(me, "honor", "read")} editHonor={can(me, "honor", "write")} />
        <ProgramsTable programs={programs} canEdit={canEdit} />
        <MapelSection rows={mapel} canEdit={canEdit} />
      </div>
    </>
  );
}
