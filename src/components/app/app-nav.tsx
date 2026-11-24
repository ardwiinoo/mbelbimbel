"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home, Users, Briefcase, CalendarCheck, FileText, BookOpen, Receipt, Settings, ShieldCheck, MoreHorizontal, LogOut, UserCircle, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_PRIORITY, NAV } from "./nav-config";
import { accountLabel, type AccessSubject } from "@/lib/access";
import { signOut } from "@/app/login/actions";
import { InstallNavButton } from "./install-app";
import { BrandMark } from "./brand-mark";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICONS = {
  home: Home, users: Users, briefcase: Briefcase, calendar: CalendarCheck,
  "file-text": FileText, book: BookOpen, receipt: Receipt, wallet: Wallet, settings: Settings, shield: ShieldCheck,
} as const;

const SHORT: Record<string, string> = { "/materi": "Materi", "/tentor": "Tentor" };

type Props = { access: AccessSubject; nama: string; namaBimbel: string; logoId?: string | null };

/** Menu yang boleh dilihat akun ini (berdasarkan akses per modul, bukan peran). */
function useItems(access: AccessSubject) {
  return NAV.filter((n) => n.visible(access)).map((n) => ({
    ...n,
    label: n.ownLabel && n.ownWhen?.(access) ? n.ownLabel : n.label,
    Icon: ICONS[n.icon as keyof typeof ICONS],
  }));
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Sidebar({ access, nama, namaBimbel, logoId = null }: Props) {
  const path = usePathname();
  const items = useItems(access);
  return (
    <aside className="glass sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex">
      <div className="flex items-center gap-2 px-4 py-5">
        <BrandMark logoId={logoId} className="size-9 rounded-xl" iconClassName="size-5" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{namaBimbel}</p>
          <p className="text-xs text-muted-foreground">{accountLabel(access)}</p>
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

export function BottomNav({ access, nama }: Props) {
  const path = usePathname();
  const items = useItems(access);
  const [open, setOpen] = useState(false);
  // 4 menu terpenting yang boleh diakses tampil di bawah; sisanya di "Lainnya"
  const primary = MOBILE_PRIORITY.map((h) => items.find((i) => i.href === h))
    .filter((i): i is (typeof items)[number] => !!i)
    .slice(0, 4);
  const rest = items.filter((i) => !primary.includes(i));

  return (
    <>
      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
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

/** Top bar HP: kaca, lengket di atas, supaya bagian atas halaman tetap jelas terbaca. */
export function MobileTopBar({ access, nama, namaBimbel, logoId = null }: Props) {
  const path = usePathname();
  const initials = nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 pt-[env(safe-area-inset-top)] md:hidden">
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <BrandMark logoId={logoId} className="size-8 rounded-lg" iconClassName="size-4.5" />
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-bold">{namaBimbel}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">{accountLabel(access)}</span>
        </span>
      </Link>
      <Link
        href="/profil"
        aria-label="Profil saya"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15",
          path.startsWith("/profil") && "bg-primary text-primary-foreground",
        )}
      >
        {initials || <UserCircle className="size-5" />}
      </Link>
    </header>
  );
}
