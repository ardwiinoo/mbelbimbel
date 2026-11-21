"use client";
// Dropdown custom (pengganti <select> bawaan browser) dengan tampilan seragam.
// Pemakaian: <AppSelect value={v} onChange={setV} options={[{ value: "", label: "Semua" }, ...]} />
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

// Base UI memakai null untuk "belum dipilih"; nilai "" kita petakan ke token khusus
// supaya opsi seperti "Semua program" tetap bisa dipilih & ditampilkan.
const EMPTY = "__empty__";
const toInner = (v: string) => (v === "" ? EMPTY : v);
const toOuter = (v: string | null) => (v === null || v === EMPTY ? "" : v);

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const items = options.map((o) => ({ value: toInner(o.value), label: o.label }));
  const hasValue = options.some((o) => o.value === value);
  return (
    <Select
      items={items}
      value={hasValue ? toInner(value) : null}
      onValueChange={(v) => onChange(toOuter(v as string | null))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer bg-background px-3 text-base hover:bg-muted/40 data-[size=default]:h-9 md:text-sm",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} className="truncate" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-72 p-1">
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value} className="cursor-pointer py-2 pl-2.5 text-sm">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
