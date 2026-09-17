// Skyline steps shown alongside a Skyline hand-off. Two directions:
//   variant "charges" (default) — pushing CAM/RET charges INTO Skyline (the
//     year-end + estimate exports). `stop` adds the prominent "stop the current
//     charges first" warning so tenants aren't double-charged.
//   variant "statements" — pulling the tenant Statement report OUT of Skyline
//     for the monthly statement import.

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

export function ImportInstructions({ stop, variant = "charges" }: { stop?: boolean; variant?: "charges" | "statements" | "budget-rent" }) {
  // variant "budget-rent" — pulling next year's SCHEDULED rent out of Skyline
  // for the budget. The two warnings are not decoration: both were handwritten
  // notes in the margin of the 2026 workbook, which is to say both have
  // already gone wrong once and neither checked itself.
  if (variant === "budget-rent") {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={LABEL}>Skyline Export Steps</div>
        <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
          <li>
            Skyline → <strong>General Ledger</strong> → <strong>G/L Information</strong> → <strong>Budget Rent Increase Calculation</strong>.
            <div style={{ fontSize: 12, marginTop: 2 }}>
              This report — not the rent roll. The rent roll carries <em>today&rsquo;s</em> rate, so it cannot know a step that has not happened yet; this one carries the scheduled charge for every month of the budget year.
            </div>
          </li>
          <li>Run it for <strong>every</strong> centre in the group, then export to Excel.</li>
          <li>
            Upload the file here as it comes out.
            <div style={{ fontSize: 12, marginTop: 2 }}>
              If you paste it into another workbook first, <strong>convert Charge Amount to a number</strong> — Skyline pastes it as text, and text sums to zero.
              You do not need to here: the importer reads text amounts, and says so when it cannot read one.
            </div>
          </li>
          <li>
            <strong>Check the coverage line after importing.</strong>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              The export can quietly leave a centre out — the 2026 workbook was missing 1100 and 1500 and it was caught by eye. The importer names any centre it did not receive, and any unit whose rent came through blank.
            </div>
          </li>
        </ol>
      </div>
    );
  }

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
