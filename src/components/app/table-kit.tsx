"use client";
// Perangkat tabel yang konsisten di semua halaman: cari + paging.
// - useClientList: data master yang ukurannya terbatas (siswa, tentor, materi, akun)
// - ServerSearch/ServerPager: data yang terus bertambah (laporan, invoice) → paging di DB
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 20;

/** Normalisasi untuk pencarian: huruf kecil, tanpa aksen. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Cari + paging di klien. `text(row)` = teks yang bisa dicari. */
export function useClientList<T>(rows: T[], text: (row: T) => string, pageSize = PAGE_SIZE) {
  const [q, setQState] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((r) => {
      const hay = norm(text(r));
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  return {
    q,
    setQ: (v: string) => {
      setQState(v);
      setPage(1);
    },
    page: cur,
    setPage,
    pages,
    total: filtered.length,
    rows: filtered.slice((cur - 1) * pageSize, cur * pageSize),
    pageSize,
  };
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Cari...",
  className,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  busy?: boolean;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-9 pl-9" aria-label={placeholder} />
      {busy ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Hapus pencarian"
          >
            <X className="size-4" />
          </button>
        )
      )}
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  pageSize = PAGE_SIZE,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} dari {total} data
      </span>
      {/* Panah selalu tampil; nonaktif bila tidak ada halaman sebelum/sesudahnya */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Halaman pertama" className="hidden sm:inline-flex">
          <ChevronsLeft />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
          <ChevronLeft />
        </Button>
        <span className="min-w-20 text-center tabular-nums">
          Hal {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
          <ChevronRight />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Halaman terakhir" className="hidden sm:inline-flex">
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}

/** Ubah query string (dipakai ServerSearch/ServerPager/filter server). */
export function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | number | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (k === "page" && Number(v) <= 1)) q.delete(k);
      else q.set(k, String(v));
    }
    const s = q.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  return { sp, set, pending };
}

/** Kotak cari yang menulis ke ?q= (debounce 350 ms) → query di DB. */
export function ServerSearch({ placeholder, className }: { placeholder?: string; className?: string }) {
  const { sp, set, pending } = useQueryNav();
  const [v, setV] = useState(sp.get("q") ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ q: v.trim() || null, page: null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <SearchBox value={v} onChange={setV} placeholder={placeholder} className={className} busy={pending} />;
}

export function ServerPager({ total, page, pageSize = PAGE_SIZE }: { total: number; page: number; pageSize?: number }) {
  const { set } = useQueryNav();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <Pager page={Math.min(page, pages)} pages={pages} total={total} pageSize={pageSize} onPage={(p) => set({ page: p })} />;
}

/** Baris kontrol di atas tabel: cari + filter + tombol aksi, spasi seragam. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}

/** Baris filter: di HP bisa digeser horizontal (teks dropdown tidak terpotong), di desktop sebaris. */
export function FilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** Kelas ukuran dropdown filter yang konsisten (lebar mengikuti isi di HP). */
export const filterSelectClass = "w-auto min-w-[9.5rem] shrink-0 sm:w-44";
