"use client";

import { useState } from "react";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { REQUEST_CATEGORIES, REQUEST_PRIORITIES, type RequestPriority } from "@/lib/maintenance/requests";

// Public tenant-facing maintenance request form. No auth required — the
// matching API endpoint is honeypot + rate-limited.

const SUBMITTABLE_PROPERTIES = PROPERTY_DEFS
  .filter((p) => !p.entityKind && (p.type === "Office" || p.type === "Retail" || p.type === "Residential"))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function SubmitPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const formEl = e.currentTarget;
      const fd = new FormData(formEl);
      // Reset the file list and append our photos directly, so the controlled
      // ordering matches what the user sees on screen.
      fd.delete("photos");
      photos.forEach((p) => fd.append("photos", p));

      // Look up the property name so the server doesn't have to re-resolve it.
      const code = String(fd.get("propertyCode") ?? "");
      const prop = SUBMITTABLE_PROPERTIES.find((p) => p.id === code);
      if (prop) fd.set("propertyName", prop.name);

      const res = await fetch("/api/maintenance/submit", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Submission failed");
      setSuccess(body.id ?? "submitted");
      formEl.reset();
      setPhotos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Maintenance Request Submitted</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Thanks — your request was received and the maintenance team has been notified.
            They'll reach out if they need more information.
          </p>
          <p className="muted small" style={{ marginBottom: 24 }}>
            Reference ID: <code>{success}</code>
          </p>
          <button onClick={() => setSuccess(null)} className="btn primary" style={{ width: "100%" }}>
            Submit another request
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={titleStyle}>Maintenance Request</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Submit a maintenance issue at your KCP property. We'll respond within one business day.
          </p>
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* Honeypot — hidden from sighted users; aria-hidden from screen readers.
            Bots that auto-fill every field will land here. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, width: 0, overflow: "hidden" }}>
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <Field label="Property" required>
          <select name="propertyCode" required defaultValue="" style={inputStyle}>
            <option value="" disabled>— Choose your building —</option>
            {SUBMITTABLE_PROPERTIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.address ? ` · ${p.address}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Unit / Suite (optional)">
          <input name="unit" type="text" placeholder="e.g. 200, Suite 4B" style={inputStyle} />
        </Field>

        <Field label="Subject" required>
          <input
            name="subject"
            type="text"
            required
            maxLength={140}
            placeholder="e.g. Leak in ceiling tile"
            style={inputStyle}
          />
        </Field>

        <Field label="Description" required>
          <textarea
            name="description"
            required
            rows={5}
            placeholder="Describe the issue in detail — when it started, where exactly, anything we should know before arriving."
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical", minHeight: 100 }}
          />
        </Field>

        <div style={twoColStyle}>
          <Field label="Category (optional)">
            <select name="category" defaultValue="" style={inputStyle}>
              <option value="">— Not sure —</option>
              {REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Priority (optional)">
            <select name="priority" defaultValue="" style={inputStyle}>
              <option value="">— Default —</option>
              {REQUEST_PRIORITIES.map((p: RequestPriority) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0 16px" }} />

        <div style={twoColStyle}>
          <Field label="Your name" required>
            <input name="tenantName" type="text" required autoComplete="name" style={inputStyle} />
          </Field>
          <Field label="Your email" required>
            <input name="tenantEmail" type="email" required autoComplete="email" style={inputStyle} />
          </Field>
        </div>

        <Field label="Phone (optional)">
          <input name="tenantPhone" type="tel" autoComplete="tel" style={inputStyle} />
        </Field>

        <Field label="Photos (optional, up to 5)">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setPhotos(files.slice(0, 5));
            }}
            style={{ ...inputStyle, padding: 7 }}
          />
          {photos.length > 0 && (
            <div className="muted small" style={{ marginTop: 6 }}>
              {photos.length} photo{photos.length === 1 ? "" : "s"} selected: {photos.map((p) => p.name).join(", ")}
            </div>
          )}
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="btn primary"
          style={{ width: "100%", fontSize: 15, padding: "12px 16px", marginTop: 8 }}
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>

        <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}>
          For after-hours emergencies (active leak, fire, security), call your property's emergency line.
        </p>
      </form>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "32px 16px",
  background: "var(--bg)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  padding: 24,
  borderRadius: 14,
  background: "var(--card)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  position: "relative",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "-0.02em",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#b91c1c", marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: "#b91c1c", fontWeight: 600,
      padding: "10px 12px",
      background: "rgba(220,38,38,0.06)",
      border: "1px solid rgba(220,38,38,0.30)",
      borderRadius: 8,
    }}>
      {children}
    </div>
  );
}
