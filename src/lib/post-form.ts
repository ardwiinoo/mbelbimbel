// Kirim FormData (upload) ke route handler kita sendiri. Dipakai komponen klien.
export type FormResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

export async function postForm(url: string, form: FormData): Promise<FormResult> {
  try {
    const res = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
    const data = (await res.json().catch(() => null)) as FormResult | null;
    if (data && typeof data.ok === "boolean") return data;
    return { ok: false, error: res.status === 413 ? "File terlalu besar" : `Gagal (HTTP ${res.status})` };
  } catch {
    return { ok: false, error: "Koneksi gagal. Periksa internet Anda." };
  }
}
