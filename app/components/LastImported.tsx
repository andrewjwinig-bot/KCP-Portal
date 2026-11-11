// Shared "Imported <date> by <user>" line — the quiet muted note used on
// every page that ingests an uploaded file (rent roll, GL/operating statements,
// cash sheet AP report, budgets, expenses, etc.) so it's easy to see when data
// was last brought in and by whom. Keep the look identical everywhere.

export function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} at ${time}`;
}

/** "DREW" / "drew" -> "Drew": names are Title Case in the UI, however the
 *  import recorded them. Leaves an already mixed-case name alone. */
export function titleName(name: string): string {
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

export function LastImported({
  at,
  by,
  label = "Imported",
  style,
}: {
  at: string | null | undefined;
  by?: string | null;
  label?: string;
  style?: React.CSSProperties;
}) {
  if (!at) return null;
  // The page header's META LINE (owner: one row of controls, one quiet line
  // under it): muted 14px, no italics, no bold name.
  return (
    <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--fs-14)", ...style }}>
      {label} {formatImportedAt(at)}{by ? ` by ${titleName(by)}` : ""}
    </p>
  );
}

/** The header's meta line: "Imported <when> by <Name>", then whatever else
 *  belongs on it — a check that passed in words, the (i) for import steps —
 *  on ONE muted row. Every page header ends in one of these. */
export function MetaLine({
  at,
  by,
  label = "Imported",
  children,
  style,
}: {
  at?: string | null;
  by?: string | null;
  label?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="muted" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--fs-14)", ...style }}>
      {at && <span>{label} {formatImportedAt(at)}{by ? ` by ${titleName(by)}` : ""}</span>}
      {children}
    </div>
  );
}
