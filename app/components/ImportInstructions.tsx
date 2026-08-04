// Skyline upload steps shown under the CAM/RET exports (year-end + estimates).
// `stop` adds the prominent "stop the current charges first" warning — required
// when replacing recurring charges (estimates) so tenants aren't double-charged.

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

export function ImportInstructions({ stop }: { stop?: boolean }) {
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
