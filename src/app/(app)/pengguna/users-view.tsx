"use client";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, EmptyState } from "@/components/app/ui";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { PasswordInput } from "@/components/ui/password-input";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { tanggal } from "@/lib/format";
import { createUser, updateUser, resetPassword } from "./actions";
import { AppSelect } from "@/components/app/app-select";

export type UserRow = {
  id: string; email: string | null; nama: string; no_wa: string | null; role: Role;
  spesialisasi: string | null; status: "aktif" | "nonaktif"; created_at: string;
};

const userSearchText = (u: UserRow) => `${u.nama} ${u.email ?? ""} ${u.no_wa ?? ""} ${u.spesialisasi ?? ""} ${ROLE_LABEL[u.role]}`;

/** Password acak mudah diketik (tanpa karakter mirip: 0/O, 1/l). */
function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

const ROLE_COLOR = { super_admin: "red", admin: "blue", tentor: "gray" } as const;

export function UsersView({ users, meId }: { users: UserRow[]; meId: string }) {
  const [fRole, setFRole] = useState("");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const byRole = useMemo(() => users.filter((u) => !fRole || u.role === fRole), [users, fRole]);
  const list = useClientList(byRole, userSearchText);

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari nama, email, WA, atau mapel..." />
        <AppSelect className="sm:w-44" value={fRole} onChange={setFRole} aria-label="Peran"
          options={[{ value: "", label: "Semua peran" }, ...Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))]} />
        <Button onClick={() => setEditing("new")}><Plus /> Buat Akun</Button>
      </Toolbar>

      {list.total === 0 ? (
        <EmptyState title="Tidak ada pengguna" />
      ) : (
        <DataTable head={["Nama", "Email login", "Peran", "Spesialisasi / WA", "Status", "Dibuat", ""]}>
          {list.rows.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.nama}{u.id === meId && <span className="ml-1 text-xs font-normal text-muted-foreground">(Anda)</span>}</Td>
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
                  <Button size="sm" variant="ghost" onClick={() => setResetting(u)}><KeyRound /> Reset password</Button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

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
            <Field label="Password awal *" hint="Minimal 8 karakter"><PasswordInput autoComplete="new-password" defaultVisible {...register("password")} /></Field>
          </>
        )}
        <Field label="Peran" hint={role === "super_admin" ? "Kontrol penuh, termasuk kelola akun." : role === "admin" ? "Operasional: siswa, jadwal, invoice, materi." : "Hanya siswa & jadwal miliknya."}>
          <Controller control={control} name="role" render={({ field }) => (
            <AppSelect value={field.value} onChange={field.onChange} options={[{ value: "tentor", label: "Tentor" }, { value: "admin", label: "Admin" }, { value: "super_admin", label: "Super Admin" }]} />
          )} />
        </Field>
        {user && (
          <Field label="Status" hint={isMe ? "Hati-hati mengubah akun Anda sendiri." : "Nonaktif = tidak bisa login."}>
            <Controller control={control} name="status" render={({ field }) => (
              <AppSelect value={field.value} onChange={field.onChange} options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} />
            )} />
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
    <FormDialog
      title={`Reset password ${user.nama}`}
      desc={`${user.email ?? ""} — untuk akun yang lupa password. Semua perangkat akun ini otomatis keluar.`}
      onClose={onClose}
    >
      <Field label="Password baru" hint="Minimal 8 karakter. Berikan ke pemilik akun, minta ganti di menu Profil setelah login.">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" defaultVisible className="font-mono" /></div>
          <Button type="button" variant="outline" onClick={() => setPw(randomPassword())}>Buat acak</Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!pw}
            onClick={() => navigator.clipboard?.writeText(pw).then(() => toast.success("Password disalin"), () => {})}
          >
            Salin
          </Button>
        </div>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending || pw.length < 8}
          onClick={() => start(async () => {
            const r = await resetPassword(user.id, pw);
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          })}
        >Simpan</Button>
      </div>
    </FormDialog>
  );
}
