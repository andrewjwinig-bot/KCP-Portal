"use client";

export default function CommissionsPage() {
  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Commissions</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      <div className="card">
        <b style={{ fontSize: 17 }}>Commissions</b>
        <p className="muted small" style={{ marginTop: 6 }}>
          This page is empty. Tell Claude how you&rsquo;d like it laid out.
        </p>
      </div>
    </main>
  );
}
