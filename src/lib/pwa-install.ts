"use client";
// Menyimpan event `beforeinstallprompt` sejak app dimuat, supaya tombol "Install"
// di mana pun bisa memicu dialog install walau popup bawaan browser tidak muncul.
import { useSyncExternalStore } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type State = { deferred: BIPEvent | null; installed: boolean };
let state: State = { deferred: null, installed: false };
const subs = new Set<() => void>();
const emit = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

let started = false;
/** Dipanggil sekali dari layout (SwRegister). */
export function startInstallListener() {
  if (started || typeof window === "undefined") return;
  started = true;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) emit({ installed: true });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // simpan, tampilkan lewat tombol kita
    emit({ deferred: e as BIPEvent });
  });
  window.addEventListener("appinstalled", () => emit({ installed: true, deferred: null }));
}

const server: State = { deferred: null, installed: false };

export type InstallInfo = {
  installed: boolean;
  canPrompt: boolean;
  platform: "ios" | "android" | "desktop";
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function useInstall(): InstallInfo {
  const s = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => server,
  );
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const platform = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document)
    ? "ios"
    : /android/i.test(ua)
      ? "android"
      : "desktop";
  return {
    installed: s.installed,
    canPrompt: !!s.deferred,
    platform,
    install: async () => {
      const d = state.deferred;
      if (!d) return "unavailable";
      await d.prompt();
      const { outcome } = await d.userChoice;
      emit({ deferred: null }); // event hanya bisa dipakai sekali
      return outcome;
    },
  };
}
