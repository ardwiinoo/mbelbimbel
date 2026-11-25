import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listDeletedStudents } from "@/server/services/students";
import { DeletedView } from "./views";

export const metadata = { title: "Data Terhapus" };

export default async function TerhapusPage() {
  const me = await requireProfile();
  if (!me.isSuperuser) redirect("/"); // khusus Super Admin
  const rows = await listDeletedStudents(me);
  return (
    <>
      <PageHeader title="Data Terhapus" desc="Siswa yang dihapus admin. Pulihkan bila salah hapus, atau biarkan saja. Invoice lunas dan riwayat honor selalu tersimpan." />
      <DeletedView rows={rows} />
    </>
  );
}
