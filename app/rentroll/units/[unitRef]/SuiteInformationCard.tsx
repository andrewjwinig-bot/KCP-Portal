"use client";

import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { MultiSelect } from "@/app/components/MultiSelect";
import {
  FLOORING_OPTIONS,
  LIGHTING_OPTIONS,
  PAINT_OPTIONS,
  RESTROOMS_OPTIONS,
  KITCHEN_OPTIONS,
  type SuiteInformation,
} from "@/lib/suites/information";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)", outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px 20px",
      alignItems: "start", padding: "12px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 8 }}>
        {label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {hint && <span style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</span>}
        {children}
      </div>
    </div>
  );
}

function UploadBox({
  label,
  onPick,
  busy,
}: {
  label: string;
  onPick: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px", cursor: busy ? "default" : "pointer",
        border: `1.5px dashed ${drag ? "#2563eb" : "var(--border)"}`,
        borderRadius: 10,
        background: drag ? "rgba(37,99,235,0.05)" : "rgba(15,23,42,0.015)",
        fontSize: 13, color: "var(--muted)", textAlign: "center",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {busy ? "Uploading…" : (
        <span>⭳ {label} — drop a file here or <span style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}>browse</span></span>
      )}
    </div>
  );
}

export default function SuiteInformationCard({ unitRef }: { unitRef: string }) {
  const [info, setInfo] = useState<SuiteInformation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<null | "attachment" | "floorplan">(null);
  const [error, setError] = useState<string | null>(null);

  const api = `/api/suites/${encodeURIComponent(unitRef)}/information`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.info) setInfo(j.info); })
      .catch(() => { /* leave null */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api]);

  function update(patch: Partial<SuiteInformation>) {
    setInfo((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setSavedFlash(false);
  }

  async function save() {
    if (!info) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setInfo(j.info);
      setDirty(false);
      setSavedFlash(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "attachment" | "floorplan", file: File) {
    setUploadingKind(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      const res = await fetch(api, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      // Only sync the file fields — keep any unsaved text edits intact.
      setInfo((prev) => (prev ? {
        ...prev,
        attachments: j.info.attachments,
        floorplan: j.info.floorplan,
      } : j.info));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKind(null);
    }
  }

  async function removeFile(kind: "attachment" | "floorplan", fileId?: string) {
    setError(null);
    try {
      const qs = new URLSearchParams({ kind });
      if (fileId) qs.set("fileId", fileId);
      const res = await fetch(`${api}?${qs.toString()}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Delete failed");
      setInfo((prev) => (prev ? {
        ...prev,
        attachments: j.info.attachments,
        floorplan: j.info.floorplan,
      } : j.info));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <div className="card">
        <SectionLabel>Suite Information</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="card">
        <SectionLabel>Suite Information</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Couldn’t load suite information.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <SectionLabel>Suite Information</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {savedFlash && !dirty && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>✓ Saved</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="btn primary"
              style={{ fontSize: 13, padding: "7px 16px", fontWeight: 700, opacity: !dirty ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            margin: "8px 0", padding: "8px 10px", borderRadius: 8,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
            color: "#b91c1c", fontSize: 12, fontWeight: 600,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <Row label="Blinds">
            <input style={inputStyle} value={info.blinds}
              onChange={(e) => update({ blinds: e.target.value })} />
          </Row>
          <Row label="Ceiling">
            <input style={inputStyle} value={info.ceiling}
              onChange={(e) => update({ ceiling: e.target.value })} />
          </Row>
          <Row label="Flooring" hint="Describe floor style and condition.">
            <MultiSelect
              options={FLOORING_OPTIONS}
              selected={info.flooring}
              onChange={(next) => update({ flooring: next })}
            />
          </Row>
          <Row label="Lighting">
            <MultiSelect
              options={LIGHTING_OPTIONS}
              selected={info.lighting}
              onChange={(next) => update({ lighting: next })}
            />
          </Row>
          <Row label="Paint">
            <select style={selectStyle} value={info.paint}
              onChange={(e) => update({ paint: e.target.value })}>
              <option value="">—</option>
              {PAINT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="Restrooms (if applicable)">
            <select style={selectStyle} value={info.restrooms}
              onChange={(e) => update({ restrooms: e.target.value })}>
              <option value="">—</option>
              {RESTROOMS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="Kitchen (if applicable)">
            <select style={selectStyle} value={info.kitchen}
              onChange={(e) => update({ kitchen: e.target.value })}>
              <option value="">—</option>
              {KITCHEN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="HVAC (size & date)">
            <input style={inputStyle} value={info.hvac}
              onChange={(e) => update({ hvac: e.target.value })} />
          </Row>
          <Row label="Water Service" hint="Size and location.">
            <input style={inputStyle} value={info.waterService}
              onChange={(e) => update({ waterService: e.target.value })} />
          </Row>
          <Row label="Water Heater">
            <input style={inputStyle} value={info.waterHeater}
              onChange={(e) => update({ waterHeater: e.target.value })} />
          </Row>
          <Row label="Electrical Service">
            <input style={inputStyle} value={info.electricalService}
              onChange={(e) => update({ electricalService: e.target.value })} />
          </Row>
          <Row label="Suite Specs Attachments" hint="Attach warranties, receipts, or other spec-related information.">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {info.attachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {info.attachments.map((a) => (
                    <div key={a.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", border: "1px solid var(--border)",
                      borderRadius: 8, background: "rgba(15,23,42,0.015)",
                    }}>
                      <a href={a.url} target="_blank" rel="noreferrer"
                        style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600,
                          color: "#0b4a7d", textDecoration: "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </a>
                      <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
                        {fmtBytes(a.size)}
                      </span>
                      <button type="button" onClick={() => removeFile("attachment", a.id)}
                        aria-label={`Remove ${a.name}`}
                        style={{ background: "transparent", border: "none", cursor: "pointer",
                          color: "var(--muted)", fontSize: 13, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <UploadBox
                label="Attach a file"
                busy={uploadingKind === "attachment"}
                onPick={(f) => upload("attachment", f)}
              />
            </div>
          </Row>
        </div>
      </div>

      <div className="card">
        <SectionLabel>Floorplan</SectionLabel>
        {info.floorplan ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {info.floorplan.contentType.startsWith("image/") ? (
              <a href={info.floorplan.url} target="_blank" rel="noreferrer">
                <img
                  src={info.floorplan.url}
                  alt="Suite floorplan"
                  style={{
                    maxWidth: "100%", maxHeight: 420, borderRadius: 10,
                    border: "1px solid var(--border)", display: "block",
                  }}
                />
              </a>
            ) : (
              <a href={info.floorplan.url} target="_blank" rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: "#0b4a7d" }}>
                {info.floorplan.name}
              </a>
            )}
            <div>
              <button type="button" onClick={() => removeFile("floorplan")}
                className="btn" style={{ fontSize: 12, padding: "5px 12px", fontWeight: 600 }}>
                Remove floorplan
              </button>
            </div>
          </div>
        ) : (
          <UploadBox
            label="Floorplan"
            busy={uploadingKind === "floorplan"}
            onPick={(f) => upload("floorplan", f)}
          />
        )}
      </div>
    </>
  );
}
