"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOKABLE_ROOMS } from "@/lib/reservations/rooms";

// Public conference-room reservation form. Matches the look of /submit.

const NAVY = "#0e2238";
const NAVY_DEEP = "#0a1a2c";
const LINE = "rgba(14,34,56,0.18)";
const LINE_DARK = "rgba(14,34,56,0.55)";
const RED = "#b91c1c";
const BG = "#f4f5f7";
const CARD = "#ffffff";
const TEXT = "#1a2238";
const MUTED = "#5a657a";

type LookupContact = {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  propertyCode: string | null;
};

export default function ReservePage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [roomUnitRef, setRoomUnitRef] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tenantCompany, setTenantCompany] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [autofilled, setAutofilled] = useState(false);

  const room = useMemo(() => BOOKABLE_ROOMS.find((r) => r.unitRef === roomUnitRef) ?? null, [roomUnitRef]);

  // Any office tenant can book any conference / training room — pull the
  // full deduped list once on page load.
  const [tenants, setTenants] = useState<string[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/reservations/tenants")
      .then((r) => r.json())
      .then((j) => { if (alive) setTenants(j.tenants ?? []); })
      .catch(() => { if (alive) setTenants([]); })
      .finally(() => { if (alive) setTenantsLoading(false); });
    return () => { alive = false; };
  }, []);

  // Min selectable date = today; max = today + 6 months.
  const dateBounds = useMemo(() => {
    const today = new Date();
    const max = new Date(today);
    max.setMonth(max.getMonth() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { min: fmt(today), max: fmt(max) };
  }, []);

  // Friendly hint when the picked date lands on a weekend.
  const weekendWarning = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    return (dow === 0 || dow === 6)
      ? "Reservations are Monday through Friday only."
      : null;
  }, [date]);

  // Email autofill via tenant directory.
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!email.includes("@") || email.length < 6) return;
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tenants/lookup?email=${encodeURIComponent(email)}`);
        const j = await res.json();
        const c: LookupContact | null = j.contact ?? null;
        if (!c) return;
        let touched = false;
        if (!firstName && c.firstName) { setFirstName(c.firstName); touched = true; }
        if (!lastName && c.lastName) { setLastName(c.lastName); touched = true; }
        if (!phone && c.phone) { setPhone(c.phone); touched = true; }
        if (!tenantCompany && c.company) { setTenantCompany(c.company); touched = true; }
        if (touched) setAutofilled(true);
      } catch { /* ignore */ }
    }, 450);
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const honey = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/reservations/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomUnitRef, tenantCompany,
          firstName, lastName, email, phone,
          date, startTime, endTime, purpose,
          website: honey,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Submission failed");
      setSuccess(j.id ?? "submitted");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setRoomUnitRef(""); setTenantCompany("");
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setDate(""); setStartTime(""); setEndTime(""); setPurpose("");
    setAutofilled(false);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT }}>
      <KormanHeader />
      <main style={{ padding: "56px 16px 80px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 42 }}>
            <div style={{ width: 54, height: 2, background: NAVY, margin: "0 auto 24px" }} />
            <h1 style={{ color: NAVY }}>Conference Room Request</h1>
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
                <InfoBox>Welcome back — we&apos;ve pre-filled what we had on file. Double-check before submitting.</InfoBox>
              )}

              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, width: 0, overflow: "hidden" }}>
                <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
              </div>

              <Field label="Room" required>
                <UnderlineSelect
                  value={roomUnitRef}
                  onChange={(v) => { setRoomUnitRef(v); setTenantCompany(""); }}
                  required
                  placeholder="Choose a room"
                  options={BOOKABLE_ROOMS.map((r) => ({
                    value: r.unitRef,
                    label: `${r.label} · ${r.propertyName}`,
                  }))}
                />
              </Field>

              <Field label="Tenant" required>
                <UnderlineSelect
                  value={tenantCompany}
                  onChange={setTenantCompany}
                  disabled={tenantsLoading}
                  required
                  placeholder={
                    tenantsLoading ? "Loading tenants…"
                    : tenants.length === 0 ? "No tenants on file"
                    : "Select your company"
                  }
                  options={tenants.map((name) => ({ value: name, label: name }))}
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
                  <UnderlineInput value={phone} onChange={setPhone} required type="tel" autoComplete="tel" />
                </Field>
                <Field label="Email" required>
                  <UnderlineInput value={email} onChange={setEmail} required type="email" autoComplete="email" />
                </Field>
              </Row>

              <Field label="Date (Monday–Friday)" required>
                <WeekdayCalendar
                  value={date}
                  onChange={setDate}
                  minISO={dateBounds.min}
                  maxISO={dateBounds.max}
                />
                {weekendWarning && (
                  <span style={{ fontSize: 12, color: RED, fontWeight: 600, marginTop: 6 }}>
                    {weekendWarning}
                  </span>
                )}
              </Field>

              <Row>
                <Field label="Start Time (8:00 AM – 6:00 PM)" required>
                  <UnderlineSelect
                    value={startTime}
                    onChange={setStartTime}
                    required
                    placeholder="Pick a start time"
                    options={QUARTER_HOUR_OPTIONS}
                  />
                </Field>
                <Field label="End Time (8:00 AM – 6:00 PM)" required>
                  <UnderlineSelect
                    value={endTime}
                    onChange={setEndTime}
                    required
                    placeholder="Pick an end time"
                    options={QUARTER_HOUR_OPTIONS}
                  />
                </Field>
              </Row>

              <Field label="Purpose (optional)">
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={4}
                  placeholder="What's the meeting for? Any setup needed (whiteboard, AV, water, etc.)?"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: 14, marginTop: 6,
                    border: `1px solid ${LINE}`,
                    background: "transparent", color: TEXT,
                    fontFamily: "inherit", fontSize: 15, lineHeight: 1.5,
                    outline: "none", resize: "vertical", minHeight: 100,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = NAVY; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = LINE; }}
                />
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
                  }}
                >
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>

              <p style={{ ...hintStyle, textAlign: "center", marginTop: 8 }}>
                You&apos;ll receive a confirmation email after submitting, and another once your reservation is approved.
              </p>
            </form>
          )}
        </div>
      </main>
      <KormanFooter />
    </div>
  );
}

// ─── brand chrome + form primitives (same vocabulary as /submit) ─────

function KormanHeader() {
  return (
    <header style={{
      background: NAVY_DEEP, padding: "22px 24px",
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
      borderTop: `1px solid ${LINE}`, padding: "28px 24px 36px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      color: MUTED, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
    }}>
      <Wordmark color={NAVY} small />
      <span>&copy; {new Date().getFullYear()} Korman Commercial Properties</span>
    </footer>
  );
}
function Wordmark({ color, small }: { color: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: small ? 10 : 14, flexShrink: 0, color }}>
      <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: small ? 18 : 26, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
      <div style={{ width: 1, height: small ? 22 : 30, background: color, opacity: 0.85, flexShrink: 0 }} />
      <div style={{ fontSize: small ? 9 : 11, letterSpacing: "0.22em", lineHeight: 1.6, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 500 }}>
        <div>COMMERCIAL</div><div>PROPERTIES</div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>{children}</div>;
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
function UnderlineInput({ value, onChange, type = "text", required, placeholder, autoComplete, min, max, step }: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  min?: string;
  max?: string;
  step?: number | string;
}) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)}
      required={required} placeholder={placeholder} autoComplete={autoComplete}
      min={min} max={max} step={step}
      style={underlineInputStyle}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = NAVY; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = LINE; }}
    />
  );
}
// 15-minute time options between 8:00 AM and 6:00 PM (08:00 … 18:00).
// Generated once; the inputs render them through the same UnderlineSelect
// vocabulary used by the rest of the form.
const QUARTER_HOUR_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let mins = 8 * 60; mins <= 18 * 60; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    out.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
  return out;
})();

// Custom date picker — native <input type="date"> can't grey out weekend
// columns. This is a tight popover calendar: weekdays inside [min, max]
// are clickable; weekends and out-of-range days are visually muted and
// non-interactive so tenants pick a valid date the first time.
function WeekdayCalendar({
  value,
  onChange,
  minISO,
  maxISO,
}: {
  value: string;
  onChange: (iso: string) => void;
  minISO: string;
  maxISO: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, mo] = value.split("-").map(Number);
      return new Date(y, mo - 1, 1);
    }
    const [y, mo] = minISO.split("-").map(Number);
    return new Date(y, mo - 1, 1);
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const min = parseISO(minISO);
  const max = parseISO(maxISO);
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const days = monthGridDays(viewMonth);

  function prevMonth() {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() - 1);
    if (lastDayOfMonth(d) < min) return;
    setViewMonth(d);
  }
  function nextMonth() {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + 1);
    if (d > max) return;
    setViewMonth(d);
  }

  const displayValue = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const d = parseISO(value);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  })();

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...underlineInputStyle,
          textAlign: "left",
          cursor: "pointer",
          color: displayValue ? TEXT : MUTED,
          paddingRight: 24,
          backgroundImage: caretSvg(),
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 4px center",
          backgroundSize: 14,
        }}
      >
        {displayValue || "Pick a date"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: CARD,
            border: `1px solid ${LINE_DARK}`,
            boxShadow: "0 8px 24px rgba(14,34,56,0.12)",
            padding: 14,
            width: 280,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={calNavBtn} aria-label="Previous month">‹</button>
            <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{monthLabel}</div>
            <button type="button" onClick={nextMonth} style={calNavBtn} aria-label="Next month">›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11, fontWeight: 600, textAlign: "center", padding: "4px 0",
                  color: i === 0 || i === 6 ? MUTED : NAVY,
                }}
              >
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const dow = d.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const outOfRange = d < min || d > max;
              const disabled = !inMonth || isWeekend || outOfRange;
              const iso = toISO(d);
              const isSelected = iso === value;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 13,
                    padding: "6px 0",
                    border: "none",
                    background: isSelected ? NAVY : "transparent",
                    color: isSelected
                      ? "#fff"
                      : disabled
                      ? "rgba(14,34,56,0.25)"
                      : inMonth ? TEXT : MUTED,
                    cursor: disabled ? "default" : "pointer",
                    textAlign: "center",
                    borderRadius: 2,
                  }}
                  aria-label={d.toDateString()}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
            Weekends are unavailable. Pick a weekday between {fmtShort(min)} and {fmtShort(max)}.
          </div>
        </div>
      )}
      {/* Hidden input keeps the value participating in the form's `required` validation. */}
      <input type="hidden" value={value} required />
    </div>
  );
}

function parseISO(iso: string): Date {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
// Returns 42 cells (6 weeks) covering the calendar grid for the month.
function monthGridDays(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}
const calNavBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${LINE}`,
  color: NAVY,
  width: 26,
  height: 26,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
};

function UnderlineSelect({ value, onChange, options, disabled, required, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean; required?: boolean; placeholder?: string;
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} required={required}
      style={{ ...underlineInputStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 24, backgroundImage: caretSvg(), backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", backgroundSize: 14 }}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = NAVY; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = LINE; }}
    >
      <option value="" disabled={required}>{placeholder ?? "Select…"}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
const underlineInputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 0 9px",
  border: "none", borderBottom: `1px solid ${LINE}`,
  background: "transparent", color: TEXT,
  fontFamily: "inherit", fontSize: 16, outline: "none",
  transition: "border-color 0.15s",
};
const hintStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.5,
};
function caretSvg() {
  const color = encodeURIComponent(NAVY);
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 7' fill='none' stroke='${color}' stroke-width='1.4'><polyline points='1 1 6 6 11 1'/></svg>")`;
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: RED, fontWeight: 600, padding: "10px 14px", background: "rgba(220,38,38,0.04)", border: `1px solid rgba(220,38,38,0.30)` }}>
      {children}
    </div>
  );
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: NAVY, fontWeight: 500, padding: "10px 14px", background: "rgba(14,34,56,0.04)", border: `1px solid ${LINE_DARK}` }}>
      {children}
    </div>
  );
}
function SuccessPanel({ id, onAnother }: { id: string; onAnother: () => void }) {
  return (
    <div style={{
      background: CARD, padding: "56px clamp(20px, 6vw, 64px)",
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
          Reservation Request Submitted
        </h2>
        <p style={{ marginTop: 10, color: MUTED, lineHeight: 1.6, fontSize: 14 }}>
          Thanks — we&apos;ll review and confirm by email shortly.
        </p>
      </div>
      <div style={{ ...hintStyle, marginTop: 0 }}>Reference ID: <code style={{ color: NAVY }}>{id}</code></div>
      <button
        onClick={onAnother}
        style={{
          marginTop: 6, background: "transparent", color: NAVY,
          border: `1px solid ${NAVY}`, padding: "12px 28px",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
          fontFamily: "inherit", cursor: "pointer",
        }}
      >
        Submit Another Reservation
      </button>
    </div>
  );
}
