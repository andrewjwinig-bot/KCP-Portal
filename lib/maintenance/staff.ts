// The three-person maintenance team. Used for "Assigned To" on Requests
// and as the "author" on notes/activity. Add more by extending this array.

export const STAFF = [
  { id: "greg",       name: "Greg" },
  { id: "jay",        name: "Jay" },
  { id: "charles",    name: "Charles" },
  { id: "contractor", name: "Contractor" },
] as const;

export type StaffId = (typeof STAFF)[number]["id"];

export function staffName(id: StaffId | null | undefined): string {
  if (!id) return "";
  return STAFF.find((s) => s.id === id)?.name ?? id;
}

export function isStaffId(v: unknown): v is StaffId {
  return typeof v === "string" && STAFF.some((s) => s.id === v);
}
