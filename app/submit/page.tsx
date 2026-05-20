"use client";

import { useEffect, useRef, useState } from "react";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { CompanyMatch } from "@/app/api/tenants/companies/route";

// Public tenant-facing service request form, styled to match the
// kormancommercial.com Maintenance page so it can drop in as a replacement.
// Rendering is fully raw (AppShell treats /submit as a public route).

const SUBMITTABLE_PROPERTIES = PROPERTY_DEFS
  .filter((p) => !p.entityKind && (p.type === "Office" || p.type === "Retail" || p.type === "Residential"))
  .sort((a, b) => a.name.localeCompare(b.name));

type LookupContact = {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  propertyCode: string | null;
};

const NAVY = "#0e2238";
const NAVY_DEEP = "#0a1a2c";
const ACCENT = "#0e2238";
const LINE = "rgba(14,34,56,0.18)";
const LINE_DARK = "rgba(14,34,56,0.55)";
const RED = "#b91c1c";
const BG = "#f4f5f7";
const CARD = "#ffffff";
const TEXT = "#1a2238";
const MUTED = "#5a657a";

export default function SubmitPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [autofilled, setAutofilled] = useState(false);

  const [companies, setCompanies] = useState<CompanyMatch[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  useEffect(() => {
    if (!propertyCode) { setCompanies([]); return; }
    let alive = true;
    setCompaniesLoading(true);
    fetch(`/api/tenants/companies?propertyCode=${encodeURIComponent(propertyCode)}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setCompanies(j.companies ?? []); })
      .catch(() => { if (alive) setCompanies([]); })
      .finally(() => { if (alive) setCompaniesLoading(false); });
    return () => { alive = false; };
  }, [propertyCode]);

  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!tenantEmail.includes("@") || tenantEmail.length < 6) return;
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tenants/lookup?email=${encodeURIComponent(tenantEmail)}`);
        const j = await res.json();
        const c: LookupContact | null = j.contact ?? null;
        if (!c) return;
        let touched = false;
        if (!firstName && c.firstName) { setFirstName(c.firstName); touched = true; }
        if (!lastName && c.lastName) { setLastName(c.lastName); touched = true; }
        if (!tenantPhone && c.phone) { setTenantPhone(c.phone); touched = true; }
        if (!propertyCode && c.propertyCode) { setPropertyCode(c.propertyCode); touched = true; }
        if (!company && c.company) { setCompany(c.company); touched = true; }
        if (touched) setAutofilled(true);
      } catch { /* ignore */ }
    }, 450);
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantEmail]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const prop = SUBMITTABLE_PROPERTIES.find((p) => p.id === propertyCode);
    try {
      const fd = new FormData();
      fd.append("firstName", firstName);
      fd.append("lastName", lastName);
      fd.append("tenantEmail", tenantEmail);
      fd.append("tenantPhone", tenantPhone);
      fd.append("propertyCode", propertyCode);
      fd.append("propertyName", prop?.name ?? "");
      fd.append("company", company);
      // Suite is derived from the rent-roll record for the picked company —
      // tenants don't enter it themselves any more. Comma-separated if the
      // tenant occupies multiple units.
      const tenantMatch = companies.find((c) => c.name === company);
      const suiteStr = tenantMatch?.units.map((u) => u.unitRef).join(", ") ?? "";
      fd.append("tenantSuite", suiteStr);
      fd.append("description", description);
      const honey = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
      fd.append("website", honey);
      photos.forEach((p) => fd.append("photos", p));

      const res = await fetch("/api/maintenance/submit", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Submission failed");
      setSuccess(body.id ?? "submitted");
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setTenantEmail("");
    setTenantPhone("");
    setPropertyCode("");
    setCompany("");
    setDescription("");
    setPhotos([]);
    setAutofilled(false);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT }}>
      <KormanHeader />

      <main style={{ padding: "56px 16px 80px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 42 }}>
            <div style={{ width: 54, height: 2, background: NAVY, margin: "0 auto 24px" }} />
            <h1 style={{ color: NAVY }}>
              Service Request
            </h1>
          </div>

          {success ? (
            <SuccessPanel id={success} onAnother={() => setSuccess(null)} />
          ) : (
            <form onSubmit={onSubmit} style={{
              background: CARD,
              padding: "48px clamp(20px, 6vw, 64px) 56px",
              boxShadow: "0 1px 0 rgba(14,34,56,0.04), 0 18px 40px rgba(14,34,56,0.06)",
              display: "flex", flexDirection: "column", gap: 28,
            }}>
              {error && <ErrorBox>{error}</ErrorBox>}
              {autofilled && (
                <InfoBox>
                  Welcome back — we&apos;ve pre-filled what we had on file. Double-check before submitting.
                </InfoBox>
              )}

              {/* Honeypot */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, width: 0, overflow: "hidden" }}>
                <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
              </div>

              <Field label="Property Name" required>
                <UnderlineSelect
                  value={propertyCode}
                  onChange={(v) => {
                    setPropertyCode(v);
                    setCompany("");
                  }}
                  required
                  placeholder="Choose your building"
                  options={SUBMITTABLE_PROPERTIES.map((p) => ({
                    value: p.id,
                    label: p.address ? `${p.name} · ${p.address}` : p.name,
                  }))}
                />
              </Field>

              <Field label="Company Name" required>
                <UnderlineInput
                  value={company}
                  onChange={setCompany}
                  required
                  placeholder="Your company / tenant name"
                  autoComplete="organization"
                />
              </Field>

              <Row>
                <Field label="First Name" required>
                  <UnderlineInput value={firstName} onChange={setFirstName} required autoComplete="given-name" />
                </Field>
                <Field label="Last Name" required>
                  <UnderlineInput value={lastName} onChange={setLastName} required autoComplete="family-name" />
                </Field>
              </Row>

              <Row>
                <Field label="Phone" required>
                  <UnderlineInput value={tenantPhone} onChange={setTenantPhone} required type="tel" autoComplete="tel" />
                </Field>
                <Field label="Email" required>
                  <UnderlineInput value={tenantEmail} onChange={setTenantEmail} required type="email" autoComplete="email" />
                </Field>
              </Row>

              <Field label="Please describe your service needs" required>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={5}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: 14, marginTop: 6,
                    border: `1px solid ${LINE}`,
                    background: "transparent", color: TEXT,
                    fontFamily: "inherit", fontSize: 15, lineHeight: 1.5,
                    outline: "none", resize: "vertical", minHeight: 120,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = NAVY; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = LINE; }}
                />
              </Field>

              <Field label="Photos (optional, up to 5)">
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "9px 16px",
                  border: `1px solid ${LINE_DARK}`,
                  background: "transparent", color: NAVY,
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
                  cursor: "pointer", marginTop: 8, alignSelf: "flex-start",
                }}>
                  Choose Photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 5))}
                    style={{ display: "none" }}
                  />
                </label>
                {photos.length > 0 && (
                  <span style={{ ...hintStyle, marginTop: 8 }}>
                    {photos.length} photo{photos.length === 1 ? "" : "s"} attached:{" "}
                    {photos.map((p) => p.name).join(", ")}
                  </span>
                )}
              </Field>

              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: NAVY_DEEP, color: "#fff",
                    border: "none", padding: "16px 48px",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                    fontFamily: "inherit",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = NAVY; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = NAVY_DEEP; }}
                >
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>

              <p style={{ ...hintStyle, textAlign: "center", marginTop: 8 }}>
                For after-hours emergencies (active leak, fire, security), call your property&apos;s emergency line.
              </p>
            </form>
          )}
        </div>
      </main>

      <KormanFooter />
    </div>
  );
}

// ── Brand chrome ──────────────────────────────────────────────────────────

function KormanHeader() {
  return (
    <header style={{
      background: NAVY_DEEP,
      padding: "22px 24px",
      display: "flex", alignItems: "center", justifyContent: "center",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <Wordmark color="#fff" />
    </header>
  );
}

function KormanFooter() {
  return (
    <footer style={{
      borderTop: `1px solid ${LINE}`,
      padding: "28px 24px 36px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      color: MUTED,
      fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
    }}>
      <Wordmark color={NAVY} small />
      <span>&copy; {new Date().getFullYear()} Korman Commercial Properties</span>
    </footer>
  );
}

function Wordmark({ color, small }: { color: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: small ? 10 : 14, flexShrink: 0, color }}>
      <span style={{
        fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
        fontWeight: 900,
        fontSize: small ? 18 : 26,
        letterSpacing: "-0.5px",
        lineHeight: 1,
      }}>
        KORMAN
      </span>
      <div style={{ width: 1, height: small ? 22 : 30, background: color, opacity: 0.85, flexShrink: 0 }} />
      <div style={{
        fontSize: small ? 9 : 11,
        letterSpacing: "0.22em",
        lineHeight: 1.6,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: 500,
      }}>
        <div>COMMERCIAL</div>
        <div>PROPERTIES</div>
      </div>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 24,
    }}>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: NAVY }}>
        {label}{required && <span style={{ color: RED, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function UnderlineInput({
  value, onChange, type = "text", required, placeholder, autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoComplete={autoComplete}
      style={underlineInputStyle}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = NAVY; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = LINE; }}
    />
  );
}

function UnderlineSelect({
  value, onChange, options, disabled, required, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      style={{ ...underlineInputStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 24, backgroundImage: caretSvg(), backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", backgroundSize: 14 }}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = NAVY; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = LINE; }}
    >
      <option value="" disabled={required}>{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const underlineInputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 0 9px",
  border: "none", borderBottom: `1px solid ${LINE}`,
  background: "transparent", color: TEXT,
  fontFamily: "inherit", fontSize: 16,
  outline: "none",
  transition: "border-color 0.15s",
};

const hintStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: MUTED,
  marginTop: 6,
  lineHeight: 1.5,
};

function caretSvg() {
  // Subtle SVG caret, navy.
  const color = encodeURIComponent(NAVY);
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 7' fill='none' stroke='${color}' stroke-width='1.4'><polyline points='1 1 6 6 11 1'/></svg>")`;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: RED, fontWeight: 600,
      padding: "10px 14px",
      background: "rgba(220,38,38,0.04)",
      border: `1px solid rgba(220,38,38,0.30)`,
    }}>
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: NAVY, fontWeight: 500,
      padding: "10px 14px",
      background: "rgba(14,34,56,0.04)",
      border: `1px solid ${LINE_DARK}`,
    }}>
      {children}
    </div>
  );
}

function SuccessPanel({ id, onAnother }: { id: string; onAnother: () => void }) {
  return (
    <div style={{
      background: CARD,
      padding: "56px clamp(20px, 6vw, 64px)",
      boxShadow: "0 1px 0 rgba(14,34,56,0.04), 0 18px 40px rgba(14,34,56,0.06)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "rgba(22,163,74,0.10)", color: "#15803d",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, fontWeight: 700,
      }}>✓</div>
      <div>
        <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 300, color: NAVY }}>
          Request Submitted
        </h2>
        <p style={{ marginTop: 10, color: MUTED, lineHeight: 1.6, fontSize: 14 }}>
          Thanks — your request was received and the service team has been notified.
          They&apos;ll reach out if they need more information.
        </p>
      </div>
      <div style={{ ...hintStyle, marginTop: 0 }}>Reference ID: <code style={{ color: NAVY }}>{id}</code></div>
      <button
        onClick={onAnother}
        style={{
          marginTop: 6,
          background: "transparent", color: NAVY,
          border: `1px solid ${NAVY}`,
          padding: "12px 28px",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        Submit Another Request
      </button>
    </div>
  );
}
