"use client";
// Menu aksi baris tabel (titik tiga): menjaga baris tetap ringkas; pilihan muncul setelah diklik.
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ActionItem = {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** Tautan (mis. PDF); dibuka di tab baru bila newTab. */
  href?: string;
  newTab?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Item yang tidak berlaku untuk baris/akun ini tidak ditampilkan sama sekali. */
  hidden?: boolean;
  /** Garis pemisah di atas item ini. */
  separator?: boolean;
};

export function ActionMenu({ items, label = "Aksi lainnya" }: { items: ActionItem[]; label?: string }) {
  const shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label={label} title={label} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        {shown.map((i) => (
          <div key={i.label}>
            {i.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={i.danger ? "destructive" : "default"}
              disabled={i.disabled}
              className="cursor-pointer gap-2 py-1.5"
              onClick={i.onClick}
              {...(i.href ? { render: <a href={i.href} {...(i.newTab ? { target: "_blank", rel: "noopener" } : {})} /> } : {})}
            >
              {i.icon}
              {i.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
