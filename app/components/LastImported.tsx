// Shared "Last imported <date> by <user>" line — the italic muted note used on
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

export function LastImported({
  at,
  by,
  label = "Last imported",
  style,
}: {
  at: string | null | undefined;
  by?: string | null;
  label?: string;
  style?: React.CSSProperties;
}) {
  if (!at) return null;
  return (
    <p className="muted small" style={{ marginTop: 4, fontStyle: "italic", ...style }}>
      {label} {formatImportedAt(at)}
      {by ? <> by <b style={{ color: "var(--text)" }}>{by}</b></> : null}
    </p>
  );
}
