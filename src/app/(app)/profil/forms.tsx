"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/app/form-dialog";
import { changeEmail, changePassword } from "./actions";

export function EmailForm({ current }: { current: string }) {
  const [email, setEmail] = useState(current);
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changeEmail(email, pw);
          if (r.ok) {
            toast.success(r.message);
            setPw("");
          } else toast.error(r.error);
        });
      }}
    >
      <Field label="Email baru">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password saat ini">
        <PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !pw || email.trim().toLowerCase() === current.toLowerCase()}>
          {pending ? "Menyimpan..." : "Simpan Email"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const mismatch = confirm.length > 0 && next !== confirm;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (next !== confirm) return toast.error("Konfirmasi password tidak sama");
        start(async () => {
          const r = await changePassword(cur, next);
          if (r.ok) {
            toast.success(r.message);
            setCur("");
            setNext("");
            setConfirm("");
          } else toast.error(r.error);
        });
      }}
    >
      <Field label="Password saat ini" className="sm:col-span-2">
        <PasswordInput autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
      </Field>
      <Field label="Password baru" hint="Minimal 8 karakter">
        <PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
      </Field>
      <Field label="Ulangi password baru" hint={mismatch ? "Tidak sama dengan password baru" : undefined}>
        <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !cur || next.length < 8 || mismatch}>
          {pending ? "Menyimpan..." : "Ganti Password"}
        </Button>
      </div>
    </form>
  );
}
