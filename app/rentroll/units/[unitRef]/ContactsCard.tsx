"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { AutosaveStatus, useAutosave } from "@/app/components/useAutosave";
import {
  emptyContact,
  newContactId,
  type SuiteContact,
} from "@/lib/suites/contacts";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)", outline: "none",
};

// ─── Suggestion derivation ──────────────────────────────────────────────────

type Suggestion = {
  key: string;                       // dedupe key
  name: string;
  email: string;
  phone: string;
  title: string;
  source: "maintenance" | "reservation";
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// dedupe identity for a contact / suggestion — email if present, else name.
function identity(name: string, email: string): string {
  return norm(email) || norm(name);
}

export default function ContactsCard({
  unitRef,
  propertyCode,
  occupantName,
}: {
  unitRef: string;
  propertyCode: string;
  occupantName: string;
}) {
  const [contacts, setContacts] = useState<SuiteContact[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const api = `/api/suites/${encodeURIComponent(unitRef)}/contacts`;

  const { saving, savedFlash, error, schedule } = useAutosave<SuiteContact[]>({
    save: async (snapshot) => {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: snapshot }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
    },
    keepalive: (snapshot) => {
      void fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: snapshot }),
        keepalive: true,
      }).catch(() => { /* ignore */ });
    },
  });

  // Mutate contacts in state and queue an autosave. Falls back to the
  // current list when contacts haven't loaded yet (a no-op since the
  // mutators all early-out without a list).
  function mutate(next: SuiteContact[]) {
    setContacts(next);
    schedule(next);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(api).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/maintenance/requests").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/reservations").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([cJ, mJ, rJ]) => {
      if (!alive) return;
      setContacts(Array.isArray(cJ?.contacts?.contacts) ? cJ.contacts.contacts : []);

      const occ = norm(occupantName);
      const seen = new Set<string>();
      const out: Suggestion[] = [];

      // Maintenance requests for this unit — by suite or property + occupant.
      for (const r of (mJ?.requests ?? []) as Array<Record<string, unknown>>) {
        const suiteMatch = typeof r.tenantSuite === "string" && r.tenantSuite === unitRef;
        const occMatch =
          typeof r.propertyCode === "string" && r.propertyCode === propertyCode &&
          occ.length > 0 && norm(r.tenantCompany as string) === occ;
        if (!suiteMatch && !occMatch) continue;
        const name = typeof r.tenantName === "string" ? r.tenantName.trim() : "";
        const email = typeof r.tenantEmail === "string" ? r.tenantEmail.trim() : "";
        if (!name && !email) continue;
        const key = identity(name, email);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name, email, phone: "", title: "", source: "maintenance" });
      }

      // Conference-room reservations made by this unit's tenant.
      for (const v of (rJ?.reservations ?? []) as Array<Record<string, unknown>>) {
        if (occ.length === 0 || norm(v.tenantCompany as string) !== occ) continue;
        const name = [v.contactFirstName, v.contactLastName]
          .map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).join(" ");
        const email = typeof v.contactEmail === "string" ? v.contactEmail.trim() : "";
        const phone = typeof v.contactPhone === "string" ? v.contactPhone.trim() : "";
        if (!name && !email && !phone) continue;
        const key = identity(name, email);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name, email, phone, title: "", source: "reservation" });
      }

      setSuggestions(out);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, unitRef, propertyCode, occupantName]);

  // Suggestions not already represented in the saved list.
  const openSuggestions = useMemo(() => {
    if (!contacts) return [];
    const have = new Set(contacts.map((c) => identity(c.name, c.email)));
    return suggestions.filter((s) => !have.has(s.key));
  }, [suggestions, contacts]);

  function update(id: string, patch: Partial<SuiteContact>) {
    if (!contacts) return;
    mutate(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addContact() {
    mutate([...(contacts ?? []), emptyContact()]);
  }

  function removeContact(id: string) {
    if (!contacts) return;
    mutate(contacts.filter((c) => c.id !== id));
  }

  function addFromSuggestion(s: Suggestion) {
    mutate([
      ...(contacts ?? []),
      { id: newContactId(), name: s.name, title: s.title, email: s.email, phone: s.phone, address: "", notes: "" },
    ]);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>Contacts</SectionLabel>
        <AutosaveStatus saving={saving} savedFlash={savedFlash} />
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
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {/* ── Suggested from maintenance & reservations ── */}
          {openSuggestions.length > 0 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: "10px 12px", borderRadius: 8,
              border: "1px dashed var(--border)", background: "rgba(37,99,235,0.03)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                Suggested from maintenance &amp; reservations
              </span>
              {openSuggestions.map((s) => (
                <div key={s.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 10px", border: "1px solid var(--border)",
                  borderRadius: 8, background: "var(--card)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name || s.email || s.phone}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[s.email, s.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                    padding: "2px 8px", borderRadius: 999, textTransform: "uppercase",
                    background: s.source === "maintenance" ? "rgba(217,119,6,0.10)" : "rgba(13,148,136,0.10)",
                    color: s.source === "maintenance" ? "#b45309" : "#0d9488",
                    border: `1px solid ${s.source === "maintenance" ? "rgba(217,119,6,0.30)" : "rgba(13,148,136,0.30)"}`,
                  }}>{s.source}</span>
                  <button
                    type="button"
                    onClick={() => addFromSuggestion(s)}
                    className="btn"
                    style={{ flexShrink: 0, fontSize: 12, padding: "5px 12px", fontWeight: 600 }}
                  >+ Add</button>
                </div>
              ))}
            </div>
          )}

          {/* ── Saved contacts ── */}
          {contacts && contacts.length === 0 && openSuggestions.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              No contacts recorded for this suite yet.
            </div>
          )}

          {contacts && contacts.map((c) => (
            <div key={c.id} style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "12px", border: "1px solid var(--border)",
              borderRadius: 10, background: "rgba(15,23,42,0.015)",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <ContactField label="Name">
                  <input style={inputStyle} value={c.name} placeholder="Full name"
                    onChange={(e) => update(c.id, { name: e.target.value })} />
                </ContactField>
                <ContactField label="Title / Role">
                  <input style={inputStyle} value={c.title} placeholder="e.g. Office Manager"
                    onChange={(e) => update(c.id, { title: e.target.value })} />
                </ContactField>
                <ContactField label="Email">
                  <input style={inputStyle} type="email" value={c.email} placeholder="name@company.com"
                    onChange={(e) => update(c.id, { email: e.target.value })} />
                </ContactField>
                <ContactField label="Phone">
                  <input style={inputStyle} value={c.phone} placeholder="(215) 555-0100"
                    onChange={(e) => update(c.id, { phone: e.target.value })} />
                </ContactField>
                <ContactField label="Address" span2>
                  <input style={inputStyle} value={c.address} placeholder="Mailing address"
                    onChange={(e) => update(c.id, { address: e.target.value })} />
                </ContactField>
                <ContactField label="Notes" span2>
                  <input style={inputStyle} value={c.notes} placeholder="Anything else worth noting"
                    onChange={(e) => update(c.id, { notes: e.target.value })} />
                </ContactField>
              </div>
              <div>
                <button type="button" onClick={() => removeContact(c.id)}
                  className="btn" style={{ fontSize: 12, padding: "5px 12px", fontWeight: 600 }}>
                  Remove contact
                </button>
              </div>
            </div>
          ))}

          <div>
            <button type="button" onClick={addContact}
              className="btn" style={{ fontSize: 13, padding: "7px 14px", fontWeight: 600 }}>
              + Add contact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactField({
  label,
  span2,
  children,
}: {
  label: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, gridColumn: span2 ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
