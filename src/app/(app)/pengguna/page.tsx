import { requireAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listUsers } from "@/server/services/users";
import { UsersView } from "./users-view";

export const metadata = { title: "Pengguna & Akses" };

export default async function PenggunaPage() {
  const me = await requireAccess("pengguna", "read");
  const users = await listUsers(me); // Super Admin tersembunyi bagi selain Super Admin

  return (
    <>
      <PageHeader
        title="Pengguna & Akses"
        desc="Buat akun, atur akses per modul (Lihat/Kelola) dan status mengajar. Setiap perubahan tercatat oleh siapa."
      />
      <UsersView users={users} me={{ id: me.id, isSuperuser: me.isSuperuser, isTutor: me.isTutor, perms: me.perms }} />
    </>
  );
}
