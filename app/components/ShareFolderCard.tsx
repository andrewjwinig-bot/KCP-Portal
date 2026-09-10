"use client";

import { useEffect, useState } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)", outline: "none",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color: "var(--muted)",
    }}>{children}</div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

// A small card that links to a SharePoint folder for one unit or property.
// The folder URL is stored per-record via /api/share-links.
export default function ShareFolderCard({
  kind,
  entityKey,
}: {
  kind: "unit" | "property";
  entityKey: string;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/share-links")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const bucket = kind === "unit" ? j?.units : j?.properties;
        setUrl((bucket && bucket[entityKey]) || "");
      })
      .catch(() => { /* leave blank */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, entityKey]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/share-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, key: entityKey, url: draft.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      const bucket = kind === "unit" ? j.units : j.properties;
      setUrl((bucket && bucket[entityKey]) || "");
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>Shared Drive Folder</SectionLabel>
        {!editing && !loading && (
          <button
            type="button"
            onClick={() => { setDraft(url); setEditing(true); setError(null); }}
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--brand)",
              background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {url ? "Change link" : "Link a folder"}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          margin: "8px 0", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Loading…</div>
      ) : editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <input
            style={inputStyle}
            value={draft}
            placeholder="Paste the SharePoint folder link (https://…)"
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={save} disabled={saving}
              className="btn primary" style={{ fontSize: 13, padding: "7px 16px", fontWeight: 700 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={saving}
              className="btn" style={{ fontSize: 13, padding: "7px 14px", fontWeight: 600 }}>
              Cancel
            </button>
            {url && (
              <button type="button" onClick={() => { setDraft(""); save(); }} disabled={saving}
                style={{
                  marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#b91c1c",
                  background: "transparent", border: "1px solid rgba(220,38,38,0.35)",
                  borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
                }}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : url ? (
        <div style={{ marginTop: 8 }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn primary"
            style={{
              fontSize: 13, padding: "8px 16px", fontWeight: 700, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <FolderIcon /> Open SharePoint Folder
          </a>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          No SharePoint folder linked yet.
        </div>
      )}
    </div>
  );
}
