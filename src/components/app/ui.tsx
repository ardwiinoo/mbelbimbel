import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const PILL: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

export function Pill({ color = "gray", children, className }: { color?: keyof typeof PILL; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", PILL[color], className)}>
      {children}
    </span>
  );
}

export const KEHADIRAN: Record<string, { label: string; color: keyof typeof PILL }> = {
  terjadwal: { label: "Terjadwal", color: "gray" },
  hadir: { label: "Hadir", color: "green" },
  tidak_hadir: { label: "Tidak Hadir", color: "red" },
  batal: { label: "Batal", color: "red" },
};

export function EmptyState({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {desc && <p className="max-w-sm text-sm text-muted-foreground">{desc}</p>}
      {children}
    </div>
  );
}

/** Tabel rapi di desktop; di HP dibungkus agar bisa scroll horizontal. */
export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-primary text-left text-primary-foreground">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&>tr:nth-child(even)]:bg-muted/40">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

export const selectClass =
  "select-native h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-background pl-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** Judul bagian di dalam halaman (mis. "A. Data Tentor"), ukuran & spasi seragam. */
export function SectionHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {desc && <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
