"use client";

import { useEffect, useRef, useState } from "react";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { CompanyMatch } from "@/app/api/tenants/companies/route";

// Public tenant-facing maintenance request form. No auth required — the
// matching API endpoint is honeypot + rate-limited.

const SUBMITTABLE_PROPERTIES = PROPERTY_DEFS
  .filter((p) => !p.entityKind && (p.type === "Office" || p.type === "Retail" || p.type === "Residential"))
  .sort((a, b) => a.name.localeCompare(b.name));

type LookupContact = {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  propertyCode: string | null;
  buildingNumber: string;
  suiteNumber: string;
};

export default function SubmitPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state — controlled inputs so we can auto-populate from the lookup
  // endpoint and from the company-units rent-roll match.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [building, setBuilding] = useState("");
  const [suite, setSuite] = useState("");
  const [company, setCompany] = useState("");
  const [companyMode, setCompanyMode] = useState<"select" | "other">("select");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [autofilled, setAutofilled] = useState(false);

  // Companies available for the currently-selected property.
  const [companies, setCompanies] = useState<CompanyMatch[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Pull companies from the rent roll whenever the property changes.
  useEffect(() => {
    if (!propertyCode) {
      setCompanies([]);
      return;
    }
    let alive = true;
    setCompaniesLoading(true);
    fetch(`/api/tenants/companies?propertyCode=${encodeURIComponent(propertyCode)}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setCompanies(j.companies ?? []); })
      .catch(() => { if (alive) setCompanies([]); })
      .finally(() => { if (alive) setCompaniesLoading(false); });
    return () => { alive = false; };
  }, [propertyCode]);

  // When the tenant picks a company that has exactly one unit on file, pre-fill
  // the suite number — most tenants only rent one suite per building.
  useEffect(() => {
    if (companyMode !== "select" || !company) return;
    const match = companies.find((c) => c.name === company);
    if (match && match.units.length === 1 && !suite) {
      setSuite(match.units[0].unitRef.replace(/^\d+-/, ""));
    }
    // Intentionally not depending on `suite` so we only run on company change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, companies, companyMode]);

  // Debounced contact lookup when the email becomes a complete address.
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
        // Fill only empty fields so we never overwrite something the user
        // just typed. After the first autofill, mark the form so we can
        // show a "Welcome back" hint.
        let touched = false;
        if (!firstName && c.firstName) { setFirstName(c.firstName); touched = true; }
        if (!lastName && c.lastName) { setLastName(c.lastName); touched = true; }
        if (!tenantPhone && c.phone) { setTenantPhone(c.phone); touched = true; }
        if (!propertyCode && c.propertyCode) { setPropertyCode(c.propertyCode); touched = true; }
        if (!building && c.buildingNumber) { setBuilding(c.buildingNumber); touched = true; }
        if (!suite && c.suiteNumber) { setSuite(c.suiteNumber); touched = true; }
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
      fd.append("building", building);
      fd.append("suite", suite);
      fd.append("company", company);
      fd.append("description", description);
      // Honeypot — pulled from a hidden DOM input (see the JSX below). The
      // server treats any non-empty value as a bot.
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
    setBuilding("");
    setSuite("");
    setCompany("");
    setCompanyMode("select");
    setDescription("");
    setPhotos([]);
    setAutofilled(false);
  }

  if (success) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Maintenance Request Submitted</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Thanks — your request was received and the maintenance team has been notified.
            They&apos;ll reach out if they need more information.
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
        <div style={{ marginBottom: 6 }}>
          <h1 style={titleStyle}>Maintenance</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Submit a maintenance issue at your KCP property. We&apos;ll respond within one business day.
          </p>
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}
        {autofilled && (
          <div style={infoBoxStyle}>
            Welcome back — we pre-filled what we had on file. Double-check before submitting.
          </div>
        )}

        {/* Honeypot — hidden from sighted users; bots tend to fill every field. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, width: 0, overflow: "hidden" }}>
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <Row>
          <Field label="First Name" required>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" style={inputStyle} />
          </Field>
          <Field label="Last Name" required>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" style={inputStyle} />
          </Field>
        </Row>

        <Row>
          <Field label="Phone" required>
            <input value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} required type="tel" autoComplete="tel" style={inputStyle} />
          </Field>
          <Field label="Email" required>
            <input value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} required type="email" autoComplete="email" style={inputStyle} />
          </Field>
        </Row>

        <Field label="Property" required>
          <select
            value={propertyCode}
            onChange={(e) => {
              setPropertyCode(e.target.value);
              setCompany("");
              setCompanyMode("select");
              setSuite("");
              setBuilding("");
            }}
            required
            style={inputStyle}
          >
            <option value="" disabled>— Choose your building —</option>
            {SUBMITTABLE_PROPERTIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.address ? ` · ${p.address}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Company">
          {companyMode === "select" ? (
            <>
              <select
                value={company}
                onChange={(e) => {
                  if (e.target.value === "__other__") {
                    setCompanyMode("other");
                    setCompany("");
                  } else {
                    setCompany(e.target.value);
                  }
                }}
                disabled={!propertyCode || companiesLoading}
                style={inputStyle}
              >
                <option value="">
                  {!propertyCode
                    ? "— Choose a property first —"
                    : companiesLoading
                    ? "Loading tenants…"
                    : companies.length === 0
                    ? "— No tenants on file —"
                    : "— Select your company —"}
                </option>
                {companies.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                    {c.units.length === 1 ? ` · ${c.units[0].unitRef}` : c.units.length > 1 ? ` · ${c.units.length} suites` : ""}
                  </option>
                ))}
                {propertyCode && <option value="__other__">My company isn&apos;t listed…</option>}
              </select>
              {propertyCode && companies.length > 0 && (
                <span className="muted small" style={{ marginTop: 4 }}>
                  Pulled from the current rent roll. Pick &quot;isn&apos;t listed&quot; if you&apos;re new or subletting.
                </span>
              )}
            </>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Your company name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => { setCompanyMode("select"); setCompany(""); }}
                className="btn"
                style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
              >
                Cancel
              </button>
            </div>
          )}
        </Field>

        <Row>
          <Field label="Building Number (if applicable)">
            <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="e.g. 5, 40A" style={inputStyle} />
          </Field>
          <Field label="Suite Number (if applicable)">
            <input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="e.g. 200, 4B" style={inputStyle} />
          </Field>
        </Row>

        <Field label="Please describe your maintenance needs" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
            placeholder="Describe the issue in detail — when it started, where exactly, anything we should know before arriving."
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical", minHeight: 110 }}
          />
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
          For after-hours emergencies (active leak, fire, security), call your property&apos;s emergency line.
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
  maxWidth: 620,
  padding: 28,
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
  fontSize: 24,
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

const infoBoxStyle: React.CSSProperties = {
  fontSize: 12, color: "#0b4a7d", fontWeight: 600,
  padding: "9px 12px",
  background: "rgba(11,74,125,0.06)",
  border: "1px solid rgba(11,74,125,0.25)",
  borderRadius: 8,
};

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 10,
    }}>
      {children}
    </div>
  );
}

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
