"use client";

// The Report Center — every report the portal produces, in one place, grouped
// by what it is about. It is a landing page, not a second copy of the reports:
// each row opens the page that produces it, where the Download menu lives.
// The list is `lib/reports/catalog.ts`; a new or custom report is one entry
// there. A person sees only the reports whose page they can open.
//
// Layout follows the roster rule: ONE card, ONE table, a band per category.

import { Fragment, useMemo, useState } from "react";
import { Pill, reportFormatTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { useUser } from "@/app/components/UserProvider";
import { isPathAllowed } from "@/lib/users";
import { REPORTS, REPORT_CATEGORIES, matchesReport } from "@/lib/reports/catalog";

export default function ReportsPage() {
  const { user } = useUser();
  const [q, setQ] = useState("");

  const mine = useMemo(() => REPORTS.filter((r) => isPathAllowed(user.id, r.href)), [user.id]);
  const shown = mine.filter((r) => matchesReport(r, q));
  const groups = REPORT_CATEGORIES
    .map((c) => ({ category: c, rows: shown.filter((r) => r.category === c) }))
    // The Custom band always shows (it is where new reports will land) unless
    // a search is narrowing the list.
    .filter((g) => g.rows.length || (g.category === "Custom" && !q.trim()));

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Reports</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Every report in the portal, in one place. Open one to run it for a property and period, then use its <b>Download</b> menu.
          </p>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a report…"
          aria-label="Find a report" style={{ width: 260 }} />
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={thL}>Report</th>
              <th style={thL}>Formats</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={g.category}>
                <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: gi ? "2px solid var(--border)" : "none" }}>
                  <td colSpan={3} style={{ ...tdL, paddingTop: 9, paddingBottom: 9 }}>
                    <span style={{ fontWeight: 800 }}>{g.category === "Custom" ? "Custom reports" : `${g.category} reports`}</span>
                    {g.rows.length > 0 && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{g.rows.length}</span>}
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdL, whiteSpace: "normal" }}>
                      <a href={r.href} style={{ fontWeight: 700, color: "var(--text)", textDecoration: "none" }}>{r.name}</a>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.description}</div>
                    </td>
                    <td style={{ ...tdL, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {r.formats.map((f) => <Pill key={f} tone={reportFormatTone(f)}>{f}</Pill>)}
                      </span>
                    </td>
                    <td style={td}>
                      <a href={r.href} className="btn" style={{ fontSize: 12, padding: "4px 12px", fontWeight: 700, textDecoration: "none" }}>Open →</a>
                    </td>
                  </tr>
                ))}
                {g.category === "Custom" && g.rows.length === 0 && (
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td colSpan={3} className="muted small" style={{ ...tdL, whiteSpace: "normal" }}>
                      Reports built just for this center — a view the other pages don&rsquo;t offer — will live here.
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {q.trim() && shown.length === 0 && (
              <tr><td colSpan={3} className="muted small" style={{ ...tdL, padding: 18 }}>No report matches &ldquo;{q}&rdquo;.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
