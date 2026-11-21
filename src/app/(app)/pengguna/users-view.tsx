"use client";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, EmptyState, selectClass } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { tanggal } from "@/lib/format";
import { createUser, updateUser, resetPassword } from "./actions";

export type UserRow = {
  id: string; email: string | null; nama: string; no_wa: string | null; role: Role;
  spesialisasi: string | null; status: "aktif" | "nonaktif"; created_at: string;
};

const ROLE_COLOR = { super_admin: "red", admin: "blue", tentor: "gray" } as const;

export function UsersView({ users, meId }: { users: UserRow[]; meId: string }) {
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const rows = useMemo(
    () =>
      users.filter(
        (u) =>
          (!fRole || u.role === fRole) &&
          (!q || `${u.nama} ${u.email}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [users, q, fRole],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nama atau email..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <select className={`${selectClass} md:w-44`} value={fRole} onChange={(e) => setFRole(e.target.value)}>
          <option value="">Semua peran</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button className="h-9" onClick={() => setEditing("new")}><Plus /> Buat Akun</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada pengguna" />
      ) : (
        <DataTable head={["Nama", "Email login", "Peran", "Spesialisasi / WA", "Status", "Dibuat", ""]}>
          {rows.map((u) => (
            <tr key={u.id}>
              <Td className="font-semibold">{u.nama}{u.id === meId && <span className="ml-1 text-xs font-normal text-muted-foreground">(Anda)</span>}</Td>
              <Td className="text-muted-foreground">{u.email}</Td>
              <Td><Pill color={ROLE_COLOR[u.role]}>{ROLE_LABEL[u.role]}</Pill></Td>
              <Td>
                {u.spesialisasi && <p>{u.spesialisasi}</p>}
                <p className="text-xs text-muted-foreground">{u.no_wa ?? "-"}</p>
              </Td>
              <Td><Pill color={u.status === "aktif" ? "green" : "gray"}>{u.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill></Td>
              <Td className="whitespace-nowrap text-muted-foreground">{tanggal(u.created_at, false)}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(u)}><Pencil /> Ubah</Button>
                  <Button size="sm" variant="ghost" onClick={() => setResetting(u)}><KeyRound /> Reset</Button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}

      {editing && <UserDialog user={editing === "new" ? null : editing} isMe={editing !== "new" && editing.id === meId} onClose={() => setEditing(null)} />}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function UserDialog({ user, isMe, onClose }: { user: UserRow | null; isMe: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      nama: user?.nama ?? "",
      email: "",
      password: "",
      role: (user?.role ?? "tentor") as Role,
      status: user?.status ?? "aktif",
      no_wa: user?.no_wa ?? "",
      spesialisasi: user?.spesialisasi ?? "",
    },
  });
  const role = useWatch({ control, name: "role" });

  return (
    <FormDialog
      title={user ? `Ubah Akun: ${user.nama}` : "Buat Akun"}
      desc={user ? user.email ?? undefined : "Akun langsung aktif. Berikan email & password ke pemiliknya."}
      onClose={onClose}
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={handleSubmit((v) =>
          start(async () => {
            const r = user
              ? await updateUser({ id: user.id, nama: v.nama, role: v.role, status: v.status, no_wa: v.no_wa, spesialisasi: v.spesialisasi })
              : await createUser(v);
            if (r.ok) { toast.success(r.message, { duration: 6000 }); onClose(); } else toast.error(r.error);
          }),
        )}
      >
        <Field label="Nama *" className="sm:col-span-2"><Input placeholder="Kak Aulia" {...register("nama")} /></Field>
        {!user && (
          <>
            <Field label="Email login *"><Input type="email" {...register("email")} /></Field>
            <Field label="Password awal *" hint="Minimal 8 karakter"><Input type="text" {...register("password")} /></Field>
          </>
        )}
        <Field label="Peran" hint={role === "super_admin" ? "Kontrol penuh, termasuk kelola akun." : role === "admin" ? "Operasional: siswa, jadwal, invoice, materi." : "Hanya siswa & jadwal miliknya."}>
          <select className={selectClass} {...register("role")}>
            <option value="tentor">Tentor</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </Field>
        {user && (
          <Field label="Status" hint={isMe ? "Hati-hati mengubah akun Anda sendiri." : "Nonaktif = tidak bisa login."}>
            <select className={selectClass} {...register("status")}>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </Field>
        )}
        <Field label="No. WhatsApp"><Input inputMode="tel" {...register("no_wa")} /></Field>
        {role === "tentor" && (
          <Field label="Spesialisasi / Mapel *" className="sm:col-span-2"><Input placeholder="Calistung, SD Umum" {...register("spesialisasi")} /></Field>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}

function ResetDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();
  return (
    <FormDialog title={`Reset password ${user.nama}`} desc={user.email ?? undefined} onClose={onClose}>
      <Field label="Password baru" hint="Minimal 8 karakter."><Input value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await resetPassword(user.id, pw);
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >Simpan</Button>
      </div>
    </FormDialog>
  );
}
