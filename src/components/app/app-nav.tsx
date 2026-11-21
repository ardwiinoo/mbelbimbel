"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home, Users, Briefcase, CalendarCheck, FileText, BookOpen, Receipt, Settings, ShieldCheck, MoreHorizontal, LogOut, GraduationCap, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-config";
import { isAdminRole, isSuperAdmin, ROLE_LABEL, type Role } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { InstallNavButton } from "./install-app";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICONS = {
  home: Home, users: Users, briefcase: Briefcase, calendar: CalendarCheck,
  "file-text": FileText, book: BookOpen, receipt: Receipt, settings: Settings, shield: ShieldCheck,
} as const;

const SHORT: Record<string, string> = { "/materi": "Materi", "/tentor": "Tentor" };

type Props = { role: Role; nama: string; namaBimbel: string };

function useItems(role: Props["role"]) {
  return NAV.filter((n) => (!n.adminOnly || isAdminRole(role)) && (!n.superOnly || isSuperAdmin(role))).map((n) => ({
    ...n,
    label: role === "tentor" && n.tentorLabel ? n.tentorLabel : n.label,
    Icon: ICONS[n.icon as keyof typeof ICONS],
  }));
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Sidebar({ role, nama, namaBimbel }: Props) {
  const path = usePathname();
  const items = useItems(role);
  return (
    <aside className="glass sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{namaBimbel}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive(path, href) && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="space-y-0.5 border-t p-2">
        <InstallNavButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10" />
        <Link
          href="/profil"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted",
            isActive(path, "/profil") && "bg-primary/10 text-primary",
          )}
        >
          <UserCircle className="size-4" />
          <span className="truncate">{nama}</span>
        </Link>
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive">
            <LogOut className="size-4" /> Keluar
          </button>
        </form>
      </div>
    </aside>
  );
}

export function BottomNav({ role, nama }: Props) {
  const path = usePathname();
  const items = useItems(role);
  const [open, setOpen] = useState(false);
  const primary = isAdminRole(role)
    ? items.filter((i) => ["/", "/siswa", "/jadwal", "/invoice"].includes(i.href))
    : items.filter((i) => ["/jadwal", "/siswa", "/laporan", "/materi"].includes(i.href));
  const rest = items.filter((i) => !primary.includes(i));

  return (
    <>
      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t md:hidden">
        <div className="grid grid-cols-5">
          {primary.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
                isActive(path, href) && "text-primary",
              )}
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{SHORT[href] ?? label.split(" ")[0]}</span>
            </Link>
          ))}
          <button
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="size-5" />
            Lainnya
          </button>
        </div>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>{nama}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 px-4 pb-4">
            {rest.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-5 text-muted-foreground" />
                {label}
              </Link>
            ))}
            <Link
              href="/profil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted"
            >
              <UserCircle className="size-5 text-muted-foreground" /> Profil Saya
            </Link>
            <InstallNavButton className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-primary hover:bg-muted" />
            <form action={signOut}>
              <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-destructive hover:bg-muted">
                <LogOut className="size-5" /> Keluar
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
