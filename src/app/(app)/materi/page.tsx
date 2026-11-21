import { isAdminRole } from "@/lib/roles";
import { requireProfile, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listMaterials } from "@/server/services/materials";
import { MaterialsView } from "./materials-view";

export const metadata = { title: "Bank Materi" };

export default async function MateriPage() {
  const profile = await requireProfile();
  const [materials, settings] = await Promise.all([listMaterials(profile), getSettings()]);

  return (
    <>
      <PageHeader title="Bank Materi / Modul Belajar" desc="Modul dan bank soal untuk dibaca dan diunduh tentor." />
      <MaterialsView
        isAdmin={isAdminRole(profile.role)}
        tutorName={profile.nama}
        waAdmin={settings.wa_admin}
        materials={materials}
      />
    </>
  );
}
