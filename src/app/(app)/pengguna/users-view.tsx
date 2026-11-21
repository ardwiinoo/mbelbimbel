"use client";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, ShieldCheck, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { DataTable, Td, Pill, EmptyState } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { AppSelect } from "@/components/app/app-select";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import {
  accountLabel,
  can,
  MODULES,
  PRESETS,
  withinGrantorAccess,
  type AccessSubject,
  type Level,
  type Module,
  type Permissions,
} from "@/lib/access";
import { tanggal, tanggalJam } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UserRow } from "@/server/services/users";
import { createUser, updateUser, resetPassword } from "./actions";

export type { UserRow };

type Me = { id: string } & AccessSubject;

const subjectOf = (u: UserRow): AccessSubject => ({ isSuperuser: u.is_superuser, isTutor: u.is_tutor, perms: u.perms });

/** Boleh-kah `me` mengelola akun ini? (cerminan aturan server, untuk menyembunyikan tombol) */
function canManage(me: Me, u: UserRow) {
  if (!can(me, "pengguna", "write")) return false;
  if (me.isSuperuser) return true;
  return !u.is_superuser && u.id !== me.id && withinGrantorAccess(me, u.perms);
}

const userSearchText = (u: UserRow) =>
  `${u.nama} ${u.email} ${u.no_wa ?? ""} ${u.spesialisasi ?? ""} ${accountLabel(subjectOf(u))} ${u.created_by ?? ""}`;

/** Password acak mudah diketik (tanpa karakter mirip: 0/O, 1/l). */
function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

export function UsersView({ users, me }: { users: UserRow[]; me: Me }) {
  const [fJenis, setFJenis] = useState("");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const canWrite = can(me, "pengguna", "write");

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        if (fJenis === "tutor") return u.is_tutor;
        if (fJenis === "super") return u.is_superuser;
        if (fJenis === "nonaktif") return u.status === "nonaktif";
        if (fJenis === "tanpa") return !u.is_superuser && !u.is_tutor && !Object.keys(u.perms).length;
        return true;
      }),
    [users, fJenis],
  );
  const list = useClientList(filtered, userSearchText);

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari nama, email, WA…" />
        <AppSelect
          className="sm:w-48"
          value={fJenis}
          onChange={setFJenis}
          aria-label="Jenis akun"
          options={[
            { value: "", label: "Semua akun" },
            { value: "tutor", label: "Yang mengajar" },
            ...(me.isSuperuser ? [{ value: "super", label: "Super Admin" }] : []),
            { value: "tanpa", label: "Tanpa akses" },
            { value: "nonaktif", label: "Nonaktif" },
          ]}
        />
        {canWrite && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Buat Akun
          </Button>
        )}
      </Toolbar>

      {list.total === 0 ? (
        <EmptyState title="Tidak ada akun" />
      ) : (
        <DataTable head={["Akun", "Akses", "Status", "Dibuat", "Terakhir diubah", ""]}>
          {list.rows.map((u) => (
            <tr key={u.id}>
              <Td>
                <p className="font-medium">
                  {u.nama}
                  {u.id === me.id && <span className="ml-1 text-xs font-normal text-muted-foreground">(Anda)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {u.spesialisasi && <p className="text-xs text-muted-foreground">{u.spesialisasi}</p>}
              </Td>
              <Td>
                <AccessBadges u={u} />
              </Td>
              <Td>
                <Pill color={u.status === "aktif" ? "green" : "gray"}>{u.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill>
              </Td>
              <Td className="text-xs whitespace-nowrap text-muted-foreground">
                <p>{tanggal(u.created_at, false)}</p>
                <p>oleh {u.created_by ?? "sistem"}</p>
              </Td>
              <Td className="text-xs whitespace-nowrap text-muted-foreground">
                <p>{tanggalJam(u.updated_at)}</p>
                <p>oleh {u.updated_by ?? "sistem"}</p>
              </Td>
              <Td>
                {canManage(me, u) && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      <Pencil /> Ubah
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                      <KeyRound /> Reset password
                    </Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

      {editing && <UserDialog user={editing === "new" ? null : editing} me={me} onClose={() => setEditing(null)} />}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function AccessBadges({ u }: { u: UserRow }) {
  if (u.is_superuser)
    return (
      <Pill color="red">
        <ShieldCheck className="size-3" /> Super Admin
      </Pill>
    );
  const write = MODULES.filter((m) => u.perms[m.key] === "write");
  const read = MODULES.filter((m) => u.perms[m.key] === "read");
  return (
    <div className="flex max-w-80 flex-wrap gap-1">
      {u.is_tutor && (
        <Pill color="blue">
          <GraduationCap className="size-3" /> Mengajar
        </Pill>
      )}
      {write.length > 0 && (
        <Pill color="green" className="whitespace-normal">
          Kelola: {write.map((m) => m.label).join(", ")}
        </Pill>
      )}
      {read.length > 0 && (
        <Pill color="gray" className="whitespace-normal">
          Lihat: {read.map((m) => m.label).join(", ")}
        </Pill>
      )}
      {!u.is_tutor && !write.length && !read.length && <span className="text-xs text-muted-foreground">Tanpa akses</span>}
    </div>
  );
}

const LEVELS: { value: "" | Level; label: string }[] = [
  { value: "", label: "Tidak ada" },
  { value: "read", label: "Lihat" },
  { value: "write", label: "Kelola" },
];

/** Matriks akses per modul. Level di atas akses pengelola dinonaktifkan (server tetap memvalidasi). */
function AccessMatrix({ me, perms, onChange }: { me: Me; perms: Permissions; onChange: (p: Permissions) => void }) {
  const set = (m: Module, v: "" | Level) => {
    const next = { ...perms };
    if (v) next[m] = v;
    else delete next[m];
    onChange(next);
  };
  return (
    <div className="overflow-hidden rounded-lg border">
      {MODULES.map((m, i) => {
        const cur = perms[m.key] ?? "";
        let hint = "Tidak bisa membuka menu ini";
        if (cur === "write") hint = m.write;
        else if (cur === "read") hint = m.read;
        return (
          <div key={m.key} className={cn("flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between", i % 2 === 1 && "bg-muted/40")}>
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={m.label}>
              {LEVELS.map((l) => {
                const allowed = l.value === "" || can(me, m.key, l.value);
                const active = cur === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!allowed}
                    title={allowed ? undefined : "Melebihi akses Anda sendiri"}
                    onClick={() => set(m.key, l.value)}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                      active && l.value === "write" && "bg-emerald-600 text-white shadow-sm",
                      active && l.value === "read" && "bg-background text-foreground shadow-sm",
                      active && l.value === "" && "bg-background text-muted-foreground shadow-sm",
                      !active && "text-muted-foreground hover:text-foreground",
                      !allowed && "opacity-40",
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UserDialog({ user, me, onClose }: { user: UserRow | null; me: Me; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [nama, setNama] = useState(user?.nama ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"aktif" | "nonaktif">(user?.status ?? "aktif");
  const [noWa, setNoWa] = useState(user?.no_wa ?? "");
  const [isTutor, setIsTutor] = useState(user?.is_tutor ?? false);
  const [spes, setSpes] = useState(user?.spesialisasi ?? "");
  const [isSuper, setIsSuper] = useState(user?.is_superuser ?? false);
  const [perms, setPerms] = useState<Permissions>(user?.perms ?? {});
  const isMe = !!user && user.id === me.id;

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key)!;
    // pengelola non-Super Admin: hanya bagian paket yang masih dalam aksesnya
    const allowed = Object.fromEntries(Object.entries(p.perms).filter(([m, lv]) => can(me, m as Module, lv as Level))) as Permissions;
    setPerms(allowed);
    setIsTutor(p.isTutor);
    if (Object.keys(allowed).length < Object.keys(p.perms).length) toast.info("Sebagian akses paket dilewati karena melebihi akses Anda");
  }

  function submit() {
    start(async () => {
      const common = { nama, is_tutor: isTutor, is_superuser: isSuper, perms, no_wa: noWa, spesialisasi: spes };
      const r = user ? await updateUser({ id: user.id, status, ...common }) : await createUser({ email, password, ...common });
      if (r.ok) {
        toast.success(r.message, { duration: 6000 });
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <FormDialog
      wide
      title={user ? `Ubah Akun: ${user.nama}` : "Buat Akun"}
      desc={
        user
          ? `${user.email} • dibuat ${tanggal(user.created_at, false)} oleh ${user.created_by ?? "sistem"}`
          : "Akun langsung aktif. Akses default kosong — pilih yang diperlukan saja."
      }
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama *">
          <Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Kak Aulia" />
        </Field>
        <Field label="No. WhatsApp">
          <Input inputMode="tel" value={noWa} onChange={(e) => setNoWa(e.target.value)} />
        </Field>
        {!user && (
          <>
            <Field label="Email login *">
              <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password awal *" hint="Minimal 8 karakter">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <PasswordInput autoComplete="new-password" defaultVisible value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="button" variant="outline" onClick={() => setPassword(randomPassword())}>
                  Acak
                </Button>
              </div>
            </Field>
          </>
        )}
        {user && (
          <Field label="Status" hint={isMe ? "Hati-hati mengubah akun Anda sendiri." : "Nonaktif = tidak bisa login, sesi langsung diputus."}>
            <AppSelect
              value={status}
              onChange={(v) => setStatus(v as "aktif" | "nonaktif")}
              options={[
                { value: "aktif", label: "Aktif" },
                { value: "nonaktif", label: "Nonaktif" },
              ]}
            />
          </Field>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 size-4" checked={isTutor} onChange={(e) => setIsTutor(e.target.checked)} />
          <span>
            <span className="text-sm font-medium">Mengajar (tentor)</span>
            <span className="block text-xs text-muted-foreground">
              Muncul di pilihan pengampu & jadwal, bisa absen foto, dan selalu melihat siswa/jadwal/laporan miliknya.
            </span>
          </span>
        </label>
        {isTutor && (
          <Field label="Spesialisasi / Mapel *">
            <Input value={spes} onChange={(e) => setSpes(e.target.value)} placeholder="Calistung, SD Umum" />
          </Field>
        )}
        {me.isSuperuser && (
          <label className="flex cursor-pointer items-start gap-2.5 border-t pt-3">
            <input type="checkbox" className="mt-0.5 size-4" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} />
            <span>
              <span className="text-sm font-medium">Super Admin</span>
              <span className="block text-xs text-muted-foreground">Semua akses + kelola semua akun. Tersembunyi dari pengelola akun lain.</span>
            </span>
          </label>
        )}
      </div>

      {!isSuper && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Akses per modul</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <Button key={p.key} type="button" size="sm" variant="outline" onClick={() => applyPreset(p.key)}>
                  {p.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => setPerms({})}>
                Kosongkan
              </Button>
            </div>
          </div>
          <AccessMatrix me={me} perms={perms} onChange={setPerms} />
          {!me.isSuperuser && <p className="text-xs text-muted-foreground">Pilihan yang redup melebihi akses Anda sendiri, jadi tidak bisa diberikan.</p>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={pending} onClick={submit}>
          {pending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </FormDialog>
  );
}

function ResetDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();
  return (
    <FormDialog title={`Reset password ${user.nama}`} desc={`${user.email} — untuk akun yang lupa password. Semua perangkat akun ini otomatis keluar.`} onClose={onClose}>
      <Field label="Password baru" hint="Minimal 8 karakter. Berikan ke pemilik akun, minta ganti di menu Profil setelah login.">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" defaultVisible className="font-mono" />
          </div>
          <Button type="button" variant="outline" onClick={() => setPw(randomPassword())}>
            Buat acak
          </Button>
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
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={pending || pw.length < 8}
          onClick={() =>
            start(async () => {
              const r = await resetPassword(user.id, pw);
              if (r.ok) {
                toast.success(r.message);
                onClose();
              } else toast.error(r.error);
            })
          }
        >
          Simpan
        </Button>
      </div>
    </FormDialog>
  );
}
