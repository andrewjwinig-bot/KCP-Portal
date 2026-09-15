"use client";

// ONE place to keep an investor's contact details.
//
// They had grown into three: a mailing address edited only on the Statement of
// Values tab, a K-1 email edited inside the share popover, and a trustee
// directory nobody thought of as contact info. Finding an investor's phone
// number meant knowing which of those to open, and there was no phone number
// anywhere.
//
// This is the hub. It sits on the investor's own row in By Investor — the place
// you land when you're thinking about a person rather than a property — and the
// Statement of Values tab renders the same component, so there is one editor
// and one store behind both.

import React, { useEffect, useRef, useState } from "react";
import type { OwnerContact } from "../../lib/properties/ownerContacts";

/** How long after the last keystroke the card saves itself. */
const AUTOSAVE_MS = 700;

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted)",
};
const FIELD_LABEL: React.CSSProperties = { ...LABEL, fontSize: 10, marginBottom: 3, display: "block" };

export type ContactForm = {
  address: string;
  email: string;
  alsoEmail: string[];
  phone: string;
  notes: string;
};

function formOf(c: OwnerContact | undefined): ContactForm {
  return {
    address: c?.address ?? "",
    email: c?.email ?? "",
    alsoEmail: c?.alsoEmail?.length ? [...c.alsoEmail] : [],
    phone: c?.phone ?? "",
    notes: c?.notes ?? "",
  };
}

export function InvestorContactCard({ name, contact, canEdit, onSave, compact }: {
  name: string;
  contact: OwnerContact | undefined;
  canEdit: boolean;
  onSave: (name: string, override: Partial<OwnerContact> | null) => Promise<boolean>;
  /** Inline variant for the Statement of Values header, which has less room. */
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContactForm>(() => formOf(contact));
  /**
   * Autosave status, for the one line under the buttons.
   *
   * The card saves itself as you type. It used to need an explicit Save, and
   * an address typed and then navigated away from was simply lost — which on
   * this card means the send has no recipient and nobody finds out until a
   * K-1 doesn't go.
   */
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  /** Skips the save that would otherwise fire on opening the editor. */
  const pristine = useRef(true);

  const also = contact?.alsoEmail ?? [];
  const has = !!contact && (!!contact.address || !!contact.email || !!contact.phone || also.length > 0);

  function begin() { setForm(formOf(contact)); pristine.current = true; setStatus("idle"); setEditing(true); }

  /** The stored shape. Blank extra recipients are dropped — a half-typed row
   *  saved mid-keystroke must not become an address we try to mail. */
  const payload = (f: ContactForm): Partial<OwnerContact> => ({
    address: f.address, email: f.email, phone: f.phone, notes: f.notes,
    alsoEmail: f.alsoEmail.map((e) => e.trim()).filter((e) => e.includes("@")),
  });

  async function commit() {
    setSaving(true);
    const ok = await onSave(name, payload(form));
    setSaving(false);
    if (ok) setEditing(false);
  }

  // Debounced autosave. The timer restarts on every keystroke, so a field is
  // written once when you stop typing rather than on every character.
  useEffect(() => {
    if (!editing) return;
    if (pristine.current) { pristine.current = false; return; }
    let cancelled = false;
    setStatus("saving");
    const t = setTimeout(() => {
      void onSave(name, payload(form)).then((ok) => {
        if (!cancelled) setStatus(ok ? "saved" : "error");
      }).catch(() => { if (!cancelled) setStatus("error"); });
    }, AUTOSAVE_MS);
    return () => { cancelled = true; clearTimeout(t); };
    // `onSave` is a fresh closure each render on some callers; keying the
    // effect on it would save on every render instead of every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editing, name]);
  async function clearIt() {
    if (!confirm(`Clear the saved contact details for ${name}? Anything seeded in the code comes back.`)) return;
    setSaving(true);
    await onSave(name, null);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="no-print" style={{
        padding: 14, border: "1px solid var(--border)", borderRadius: 10,
        background: "var(--card)", display: "grid", gap: 10, maxWidth: 620,
      }}>
        <div style={LABEL}>Contact · {name}</div>

        <label>
          <span style={FIELD_LABEL}>Email</span>
          <input type="email" placeholder="name@example.com" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={{ width: "100%" }} />
        </label>

        {/* Anyone else who should get what this investor gets. Each of them can
            open the K-1 the link leads to, so they are listed one per row and
            named on the send rather than hidden in a comma-separated field. */}
        <div>
          <span style={FIELD_LABEL}>Also send to</span>
          <div style={{ display: "grid", gap: 6 }}>
            {form.alsoEmail.map((addr, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="email" placeholder="accountant@example.com" value={addr}
                  onChange={(e) => setForm((f) => {
                    const next = [...f.alsoEmail]; next[i] = e.target.value; return { ...f, alsoEmail: next };
                  })} style={{ flex: 1 }} />
                <button type="button" className="btn" title="Remove this recipient"
                  onClick={() => setForm((f) => ({ ...f, alsoEmail: f.alsoEmail.filter((_, n) => n !== i) }))}
                  style={{ fontSize: 12, padding: "5px 10px", color: "#b91c1c" }}>Remove</button>
              </div>
            ))}
            <div>
              <button type="button" className="btn"
                onClick={() => setForm((f) => ({ ...f, alsoEmail: [...f.alsoEmail, ""] }))}
                style={{ fontSize: 12, padding: "5px 10px" }}>+ Add a recipient</button>
              <span className="muted" style={{ fontSize: 11.5, marginLeft: 10 }}>
                An accountant or manager who should receive what {name} receives.
              </span>
            </div>
          </div>
        </div>

        <label>
          <span style={FIELD_LABEL}>Phone</span>
          <input type="tel" placeholder="(215) 555-0100" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={{ width: "100%" }} />
        </label>

        <label>
          <span style={FIELD_LABEL}>Mailing address</span>
          <input placeholder="c/o …, street, city, state ZIP" value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={{ width: "100%" }} />
        </label>

        <label>
          <span style={FIELD_LABEL}>Notes</span>
          <input placeholder="Optional" value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ width: "100%" }} />
        </label>

        {/* Autosave means there is nothing to Cancel back to — the edits are
            already stored — so the card says what it did instead of offering
            a button that would be a lie. Clear is the way back to nothing. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="btn primary" disabled={saving} onClick={commit}
            style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{saving ? "Saving…" : "Done"}</button>
          <span aria-live="polite" style={{
            fontSize: 11.5, fontWeight: 700,
            color: status === "error" ? "#b91c1c" : status === "saved" ? "#15803d" : "var(--muted)",
          }}>
            {status === "saving" ? "Saving…"
              : status === "saved" ? "Saved ✓"
              : status === "error" ? "Couldn't save — check your connection"
              : "Saves as you type"}
          </span>
          {has && (
            <button type="button" className="btn" disabled={saving} onClick={clearIt}
              style={{ fontSize: 12, padding: "6px 12px", marginLeft: "auto", color: "#b91c1c" }}>Clear</button>
          )}
        </div>
      </div>
    );
  }

  if (!has) {
    if (!canEdit) return null;
    return (
      <button type="button" className="btn no-print" onClick={begin}
        style={{ fontSize: 12, padding: "5px 10px" }}>+ Add contact info</button>
    );
  }

  const rows: { label: string; node: React.ReactNode }[] = [];
  if (contact!.email) rows.push({ label: "Email", node: <a href={`mailto:${contact!.email}`} style={{ color: "var(--brand)" }}>{contact!.email}</a> });
  if (also.length) rows.push({
    label: also.length === 1 ? "Also to" : `Also to (${also.length})`,
    node: (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2px 10px" }}>
        {also.map((a) => <a key={a} href={`mailto:${a}`} style={{ color: "var(--brand)" }}>{a}</a>)}
      </span>
    ),
  });
  if (contact!.phone) rows.push({ label: "Phone", node: <a href={`tel:${contact!.phone.replace(/[^\d+]/g, "")}`} style={{ color: "var(--brand)" }}>{contact!.phone}</a> });
  if (contact!.address) rows.push({ label: "Address", node: <span>{contact!.address}</span> });
  if (contact!.notes) rows.push({ label: "Notes", node: <span className="muted">{contact!.notes}</span> });

  return (
    <div style={compact ? undefined : {
      padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: rows.length ? 8 : 0 }}>
        <span style={LABEL}>Contact</span>
        {canEdit && (
          <button type="button" className="btn no-print" onClick={begin}
            style={{ fontSize: 11, padding: "2px 9px", marginLeft: "auto" }}>Edit</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 14px", fontSize: 13, alignItems: "baseline" }}>
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <span style={{ ...LABEL, fontSize: 10 }}>{r.label}</span>
            <span style={{ minWidth: 0, wordBreak: "break-word" }}>{r.node}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
