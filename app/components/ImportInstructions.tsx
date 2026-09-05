// Skyline steps shown alongside a Skyline hand-off. Two directions:
//   variant "charges" (default) — pushing CAM/RET charges INTO Skyline (the
//     year-end + estimate exports). `stop` adds the prominent "stop the current
//     charges first" warning so tenants aren't double-charged.
//   variant "statements" — pulling the tenant Statement report OUT of Skyline
//     for the monthly statement import.

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

export function ImportInstructions({ stop, variant = "charges" }: { stop?: boolean; variant?: "charges" | "statements" }) {
  if (variant === "statements") {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={LABEL}>Skyline Export Steps</div>
        <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
          <li>Run Skyline&rsquo;s tenant <strong>Statement</strong> report for the month, across the buildings you&rsquo;re billing.</li>
          <li>Report Destination: <strong>Excel</strong> — save the .xls it produces.</li>
          <li>Upload it here <strong>unmodified</strong>. Don&rsquo;t delete rows, re-sort, or paste into a new sheet: the parser reads Skyline&rsquo;s own layout and reconciles every tenant to the balance Skyline printed.</li>
          <li>Shopping centers and business parks export separately — upload both and they merge into the one month.</li>
          <li>Review the tie-outs, then <strong>Publish</strong> to release the month to the tenant portal.</li>
        </ol>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={LABEL}>Skyline Import Steps</div>
      {stop && (
        <div style={{ marginTop: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 8, padding: "9px 12px" }}>
          <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 12.5 }}>⚠ STOP the current year&rsquo;s charges BEFORE importing — otherwise tenants are double-charged.</div>
          <div style={{ color: "#7f1d1d", fontSize: 12, marginTop: 3 }}>Property Management → Additional Functions → Universal Charges → Stop CAM, INS &amp; RET.</div>
        </div>
      )}
      <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        <li>Paste values into a blank workbook — <strong>do not paste headers</strong>.</li>
        <li>Clear all blank or $0 rows once pasted.</li>
        {stop && <li><strong style={{ color: "#b91c1c" }}>Stop the current year&rsquo;s charges</strong> (Universal Charges → Stop CAM, INS &amp; RET) so they aren&rsquo;t charged twice.</li>}
        <li>Upload new data — Skyline → Other Modules → Data Import → <strong>Unit Charges → Tenant Monthly Charges</strong>. Report Destination: <strong>Screen</strong>.</li>
      </ol>
    </div>
  );
}
