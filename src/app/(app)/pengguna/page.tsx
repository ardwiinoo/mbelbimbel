import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listUsers } from "@/server/services/users";
import { UsersView } from "./users-view";

export const metadata = { title: "Pengguna" };

export default async function PenggunaPage() {
  const me = await requireSuperAdmin();
  const users = await listUsers(me);

  return (
    <>
      <PageHeader
        title="Pengguna & Akun"
        desc="Khusus Super Admin: buat akun Admin/Tentor, ubah peran, aktif/nonaktif, dan reset password."
      />
      <UsersView users={users} meId={me.id} />
    </>
  );
}
