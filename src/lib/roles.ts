// Dipakai di server & klien.
export type Role = "super_admin" | "admin" | "tentor";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  tentor: "Tentor",
};

/** Super Admin otomatis punya semua hak Admin. */
export const isAdminRole = (r: Role | null | undefined) => r === "admin" || r === "super_admin";
export const isSuperAdmin = (r: Role | null | undefined) => r === "super_admin";
