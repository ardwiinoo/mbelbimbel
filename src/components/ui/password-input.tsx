"use client";
import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Tampilkan isi password sejak awal (mis. password acak hasil reset). */
  defaultVisible?: boolean;
};

/** Input password dengan tombol mata untuk tampil/sembunyikan. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className, defaultVisible = false, ...props },
  ref,
) {
  const [visible, setVisible] = useState(defaultVisible);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
