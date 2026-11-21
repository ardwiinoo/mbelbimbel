"use client";
// Pemilih tanggal & jam custom (pengganti <input type="date|time"> bawaan browser).
// Nilai tetap string yang sama dengan input bawaan: tanggal "YYYY-MM-DD", jam "HH:MM",
// jadi server action & validasi tidak perlu diubah.
import { useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { AppSelect } from "@/components/app/app-select";
import { cn } from "@/lib/utils";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parse(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}
/** Hari ini menurut WIB (aplikasi memakai WIB di semua tempat). */
function todayWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function label(v: string) {
  const p = parse(v);
  if (!p) return null;
  const hari = new Date(Date.UTC(p.y, p.m, p.d)).toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" });
  // Nama hari hanya tampil bila kolomnya cukup lebar (container query) supaya tanggal tidak terpotong
  return (
    <>
      <span className="hidden @[12.5rem]:inline">{hari}, </span>
      {p.d} {BULAN_PENDEK[p.m]} {p.y}
    </>
  );
}

type View = "day" | "month" | "year";

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pilih tanggal",
  clearable = false,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  /** Tampilkan tombol hapus (untuk field opsional, mis. tanggal lahir). */
  clearable?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = todayWib();
  const start = parse(value) ?? parse(today)!;
  const [cursor, setCursor] = useState({ y: start.y, m: start.m });
  const [view, setView] = useState<View>("day");

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      const p = parse(value) ?? parse(today)!;
      setCursor({ y: p.y, m: p.m });
      setView("day");
    }
  }
  const disabled = (d: string) => (!!min && d < min) || (!!max && d > max);
  const pick = (d: string) => {
    if (disabled(d)) return;
    onChange(d);
    setOpen(false);
  };
  const shift = (n: number) =>
    setCursor((c) => {
      const t = c.y * 12 + c.m + n;
      return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });

  const days = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Senin = kolom pertama
    const total = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) cells.push(iso(cursor.y, cursor.m, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor]);

  const yearBase = cursor.y - (cursor.y % 12);
  const cell =
    "flex items-center justify-center rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <div className={cn("@container relative", className)}>
        <Popover.Trigger
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-base transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring md:text-sm",
            clearable && value && "pr-8",
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? label(value) : placeholder}</span>
        </Popover.Trigger>
        {clearable && value && (
          <button
            type="button"
            aria-label="Kosongkan tanggal"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-[60]">
          <Popover.Popup className="w-[18.5rem] origin-[var(--transform-origin)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* Header: navigasi + judul yang bisa diklik untuk pindah tampilan bulan/tahun */}
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Sebelumnya"
                onClick={() => (view === "day" ? shift(-1) : setCursor((c) => ({ ...c, y: c.y - (view === "year" ? 12 : 1) })))}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setView(view === "day" ? "month" : view === "month" ? "year" : "day")}
                className="rounded-lg px-2.5 py-1 text-sm font-semibold hover:bg-muted"
              >
                {view === "day" && `${BULAN[cursor.m]} ${cursor.y}`}
                {view === "month" && cursor.y}
                {view === "year" && `${yearBase} – ${yearBase + 11}`}
              </button>
              <button
                type="button"
                aria-label="Berikutnya"
                onClick={() => (view === "day" ? shift(1) : setCursor((c) => ({ ...c, y: c.y + (view === "year" ? 12 : 1) })))}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {view === "day" && (
              <>
                <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
                  {HARI.map((h) => (
                    <span key={h} className="py-1">
                      {h}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((d, i) =>
                    d ? (
                      <button
                        key={d}
                        type="button"
                        disabled={disabled(d)}
                        onClick={() => pick(d)}
                        aria-pressed={d === value}
                        className={cn(
                          cell,
                          "size-9",
                          d === value
                            ? "bg-primary font-semibold text-primary-foreground"
                            : d === today
                              ? "font-semibold text-primary ring-1 ring-primary/40 hover:bg-primary/10"
                              : "hover:bg-muted",
                        )}
                      >
                        {Number(d.slice(8))}
                      </button>
                    ) : (
                      <span key={`e${i}`} />
                    ),
                  )}
                </div>
              </>
            )}

            {view === "month" && (
              <div className="grid grid-cols-3 gap-1.5">
                {BULAN_PENDEK.map((b, m) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setCursor((c) => ({ ...c, m }));
                      setView("day");
                    }}
                    className={cn(cell, "h-10", m === cursor.m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}

            {view === "year" && (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => yearBase + i).map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setCursor((c) => ({ ...c, y }));
                      setView("month");
                    }}
                    className={cn(cell, "h-10", y === cursor.y ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <button
                type="button"
                disabled={disabled(today)}
                onClick={() => pick(today)}
                className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                Hari ini
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
                >
                  Kosongkan
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/** Jam "HH:MM" lewat dua dropdown (jam & menit, kelipatan 5 menit). */
export function TimePicker({ value, onChange, "aria-label": ariaLabel }: { value: string; onChange: (v: string) => void; "aria-label"?: string }) {
  const [h = "", m = ""] = value.split(":");
  // Nilai lama yang bukan kelipatan 5 (mis. 20:38) tetap bisa ditampilkan
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel}>
      <AppSelect aria-label="Jam" value={h} placeholder="Jam" onChange={(v) => onChange(`${v}:${m || "00"}`)} options={HOURS.map((x) => ({ value: x, label: x }))} />
      <span className="font-semibold text-muted-foreground">:</span>
      <AppSelect aria-label="Menit" value={m} placeholder="Mnt" onChange={(v) => onChange(`${h || "08"}:${v}`)} options={minutes.map((x) => ({ value: x, label: x }))} />
    </div>
  );
}
