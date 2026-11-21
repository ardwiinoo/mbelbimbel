import { can } from "@/lib/access";
import { requireAccess, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listMaterials } from "@/server/services/materials";
import { MaterialsView } from "./materials-view";

export const metadata = { title: "Bank Materi" };

export default async function MateriPage() {
  const profile = await requireAccess("materi", "read");
  const [materials, settings] = await Promise.all([listMaterials(profile), getSettings()]);

  return (
    <>
      <PageHeader title="Bank Materi / Modul Belajar" desc="Modul dan bank soal untuk dibaca dan diunduh tentor." />
      <MaterialsView
        canManage={can(profile, "materi", "write")}
        tutorName={profile.nama}
        waAdmin={settings.wa_admin}
        materials={materials}
      />
    </>
  );
}
