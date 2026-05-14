"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RESERVATION_STATUSES,
  type Reservation,
  type ReservationStatus,
} from "@/lib/reservations/storage";
import { BOOKABLE_ROOMS } from "@/lib/reservations/rooms";
import { useUser } from "@/app/components/UserProvider";
import { Pill, Badge, reservationStatusTone } from "@/app/components/Pill";

type Filter = "Pending" | "Approved" | "Declined" | "All";

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function prettyTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ampm}`;
}

export default function ReservationsPage() {
  const { user } = useUser();
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [roomFilter, setRoomFilter] = useState<string>("All");
  const [selected, setSelected] = useState<Reservation | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reservations");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setReservations(body.reservations ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    if (!reservations) return [];
    return reservations.filter((r) => {
      if (filter !== "All" && r.status !== filter) return false;
      if (roomFilter !== "All" && r.roomUnitRef !== roomFilter) return false;
      return true;
    });
  }, [reservations, filter, roomFilter]);

  const counts = useMemo(() => {
    const all = reservations ?? [];
    return {
      pending: all.filter((r) => r.status === "Pending").length,
      approved: all.filter((r) => r.status === "Approved").length,
      declined: all.filter((r) => r.status === "Declined").length,
      total: all.length,
    };
  }, [reservations]);

  // Same-day other reservations for the selected reservation — drives the
  // Modify composer's "what else is booked that day" context.
  function otherSameDay(r: Reservation): Reservation[] {
    return (reservations ?? [])
      .filter((x) => x.id !== r.id && x.date === r.date && x.status !== "Declined")
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Conference Room Reservations</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={reload}
            disabled={loading}
            className="btn"
            style={{ fontSize: 13, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Pull the latest reservations"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{
                animation: loading ? "spin 0.8s linear infinite" : "none",
                transformOrigin: "center",
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <a
            href="/reserve"
            target="_blank"
            rel="noopener noreferrer"
            className="btn primary"
            style={{ fontSize: 13, padding: "6px 12px", textDecoration: "none" }}
            title="Open the public conference-room reservation form in a new tab"
          >
            Reservation Form →
          </a>
          <a
            href="/service"
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ fontSize: 13, padding: "6px 12px", textDecoration: "none" }}
            title="Open the tenant Service Request landing in a new tab"
          >
            Tenant Flow →
          </a>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Couldn&apos;t load reservations</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        <TabButton active={filter === "Pending"} onClick={() => setFilter("Pending")}>
          Pending <Badge>{counts.pending}</Badge>
        </TabButton>
        <TabButton active={filter === "Approved"} onClick={() => setFilter("Approved")}>
          Approved <Badge muted>{counts.approved}</Badge>
        </TabButton>
        <TabButton active={filter === "Declined"} onClick={() => setFilter("Declined")}>
          Declined <Badge muted>{counts.declined}</Badge>
        </TabButton>
        <TabButton active={filter === "All"} onClick={() => setFilter("All")}>
          All <Badge muted>{counts.total}</Badge>
        </TabButton>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "0 2px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Room</span>
          <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} style={selectStyle}>
            <option value="All">All rooms</option>
            {BOOKABLE_ROOMS.map((r) => (
              <option key={r.unitRef} value={r.unitRef}>{r.label} — {r.propertyName}</option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", paddingBottom: 6 }}>
          {loading ? "Loading…" : `${filtered.length} of ${(reservations ?? []).length}`}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Tenant</th>
                <th>Contact</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="muted small" style={{ padding: 16 }}>
                  No reservations in this view.
                </td></tr>
              )}
              {filtered.map((r) => {
                const ss = reservationStatusTone(r.status);
                return (
                  <tr
                    key={r.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(r)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                  >
                    <td style={{ fontWeight: 600 }}>{r.roomLabel}<div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>{r.propertyName}</div></td>
                    <td style={{ fontSize: 13 }}>{r.tenantCompany}</td>
                    <td style={{ fontSize: 13 }}>
                      {r.contactFirstName} {r.contactLastName}
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.contactEmail}</div>
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{prettyDate(r.date)}</td>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{prettyTime(r.startTime)}–{prettyTime(r.endTime)}</td>
                    <td><Pill tone={ss}>{r.status}</Pill></td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ReservationModal
          reservation={selected}
          sameDay={otherSameDay(selected)}
          currentUser={user.label}
          onClose={() => setSelected(null)}
          onChange={(updated) => {
            setReservations((prev) => prev?.map((r) => r.id === updated.id ? updated : r) ?? prev);
            setSelected(updated);
          }}
        />
      )}
    </main>
  );
}

// ── modal ──────────────────────────────────────────────────────────────

function ReservationModal({
  reservation, sameDay, currentUser, onClose, onChange,
}: {
  reservation: Reservation;
  sameDay: Reservation[];
  currentUser: string;
  onClose: () => void;
  onChange: (r: Reservation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<null | "modify" | "custom">(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function setStatus(status: ReservationStatus) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decidedBy: currentUser }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      onChange(j.reservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setError(null);
    try {
      // 1. Flip to Approved.
      const patchRes = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved", decidedBy: currentUser }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchJson.error ?? "Update failed");
      let updated: Reservation = patchJson.reservation;

      // 2. Send approval email.
      const subject = `Reservation approved — ${reservation.roomLabel} on ${prettyDate(reservation.date)}`;
      const body = approveEmailBody(reservation, currentUser);
      const mailRes = await fetch(`/api/reservations/${reservation.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: currentUser, subject, body }),
      });
      const mailJson = await mailRes.json();
      if (mailRes.ok) updated = mailJson.reservation;
      // Even if mail fails, the approval stuck — surface the failure but keep
      // the status change.
      else setError(`Approved, but email failed: ${mailJson.error ?? "send failed"}`);

      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally { setBusy(false); }
  }

  const ss = reservationStatusTone(reservation.status);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 16px 32px", zIndex: 100, overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", color: "var(--text)",
          borderRadius: 14, border: "1px solid var(--border)",
          maxWidth: 880, width: "100%",
          boxShadow: "0 24px 60px rgba(15,23,42,0.32)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 32px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {reservation.roomLabel}
              </h2>
              <div className="muted small" style={{ marginTop: 4 }}>{reservation.propertyName} · {reservation.id}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--muted)", flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill tone={ss}>{reservation.status}</Pill>
            {reservation.decidedBy && (
              <span className="muted small">
                by {reservation.decidedBy} · {reservation.decidedAt ? new Date(reservation.decidedAt).toLocaleString() : ""}
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16, padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 10,
            background: "rgba(15,23,42,0.025)",
          }}>
            <MetaCell label="Tenant" value={reservation.tenantCompany} />
            <MetaCell label="Contact" value={`${reservation.contactFirstName} ${reservation.contactLastName}`} sub={reservation.contactEmail} />
            <MetaCell label="Phone" value={reservation.contactPhone} />
            <MetaCell label="Date" value={prettyDate(reservation.date)} />
            <MetaCell label="Time" value={`${prettyTime(reservation.startTime)} – ${prettyTime(reservation.endTime)}`} />
          </div>

          {reservation.purpose && (
            <Section title="Purpose">
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "rgba(15,23,42,0.025)" }}>
                {reservation.purpose}
              </div>
            </Section>
          )}

          {sameDay.length > 0 && (
            <Section title={`Other bookings on ${prettyDate(reservation.date)}`}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--muted)" }}>
                {sameDay.map((b) => (
                  <li key={b.id}>
                    {b.roomLabel} · {prettyTime(b.startTime)}–{prettyTime(b.endTime)} · {b.tenantCompany}
                    {b.status === "Pending" && <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 600 }}>(pending)</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Notes (${reservation.notes.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reservation.notes.length === 0 && <div className="muted small">No notes yet.</div>}
              {reservation.notes.map((n) => (
                <div key={n.id} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "rgba(15,23,42,0.025)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>
                    {n.author} · {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.text}</div>
                </div>
              ))}
            </div>
          </Section>

          {composer && (
            <EmailComposer
              reservation={reservation}
              sameDay={sameDay}
              currentUser={currentUser}
              mode={composer}
              onCancel={() => setComposer(null)}
              onSent={(updated) => { setComposer(null); onChange(updated); }}
            />
          )}

          {error && <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
        </div>

        <div style={{
          padding: "16px 32px 20px", borderTop: "1px solid var(--border)",
          background: "rgba(15,23,42,0.02)",
          display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setComposer("custom")} disabled={busy} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>
              ✉ Email tenant
            </button>
            {reservation.status !== "Declined" && (
              <button onClick={() => setStatus("Declined")} disabled={busy} className="btn" style={{ fontSize: 13, padding: "8px 14px", color: "#b91c1c", borderColor: "rgba(220,38,38,0.35)" }}>
                Decline
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setComposer("modify")} disabled={busy} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>
              Modify (suggest alternates)
            </button>
            {reservation.status !== "Approved" && (
              <button onClick={approve} disabled={busy} className="btn primary" style={{ fontSize: 14, padding: "10px 22px", fontWeight: 700 }}>
                {busy ? "Working…" : "✓ Approve"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailComposer({
  reservation, sameDay, currentUser, mode, onCancel, onSent,
}: {
  reservation: Reservation;
  sameDay: Reservation[];
  currentUser: string;
  mode: "modify" | "custom";
  onCancel: () => void;
  onSent: (r: Reservation) => void;
}) {
  const [author, setAuthor] = useState<string>(currentUser);
  const [subject, setSubject] = useState(() => mode === "modify"
    ? `Your reservation request — ${reservation.roomLabel} on ${prettyDate(reservation.date)}`
    : `Re: Reservation request — ${reservation.roomLabel}`);
  const [text, setText] = useState(() => mode === "modify"
    ? modifyEmailBody(reservation, sameDay, author)
    : customEmailBody(reservation, author));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(mode === "modify" ? modifyEmailBody(reservation, sameDay, author) : customEmailBody(reservation, author));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author, mode]);

  async function send() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, subject, body: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      onSent(j.reservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      padding: 14, border: "1px solid rgba(11,74,125,0.40)", borderRadius: 10,
      background: "rgba(11,74,125,0.04)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#0b4a7d" }}>
          {mode === "modify" ? "Modify — propose alternates" : "Email tenant"} — {reservation.contactEmail}
        </span>
        <button onClick={onCancel} disabled={busy} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>From</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 140 }} />
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...selectStyle, width: "100%", fontSize: 14, fontWeight: 600 }} />
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={12}
        style={{ ...selectStyle, width: "100%", minHeight: 220, fontFamily: "inherit", resize: "vertical", fontSize: 13, lineHeight: 1.5 }}
      />
      {error && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} disabled={busy} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>Cancel</button>
        <button onClick={send} disabled={busy} className="btn primary" style={{ fontSize: 13, padding: "8px 16px" }}>
          {busy ? "Sending…" : "Send email"}
        </button>
      </div>
    </div>
  );
}

function approveEmailBody(r: Reservation, sender: string): string {
  return [
    `Hi ${r.contactFirstName || "there"},`,
    "",
    `Good news — your reservation request for the ${r.roomLabel} at ${r.propertyName} has been approved.`,
    "",
    `Date: ${prettyDate(r.date)}`,
    `Time: ${prettyTime(r.startTime)} – ${prettyTime(r.endTime)}`,
    r.purpose ? `Purpose: ${r.purpose}` : null,
    `Reference: ${r.id}`,
    "",
    "If anything changes on your end, just reply to this email and we'll sort it out.",
    "",
    "Thanks,",
    sender,
    "KCP Property Management",
  ].filter((l) => l !== null).join("\n");
}

function modifyEmailBody(r: Reservation, sameDay: Reservation[], sender: string): string {
  const conflicts = sameDay
    .filter((b) => b.roomUnitRef === r.roomUnitRef)
    .map((b) => `  • ${prettyTime(b.startTime)}–${prettyTime(b.endTime)} (${b.tenantCompany})`);
  const otherRooms = ["3640-112", "4060-217", "4080-201"]
    .filter((u) => u !== r.roomUnitRef);
  const roomLines = otherRooms.map((u) => {
    const busyOnDate = sameDay.filter((b) => b.roomUnitRef === u);
    if (busyOnDate.length === 0) return `  • Other room is open all day`;
    return `  • Other room booked: ${busyOnDate.map((b) => `${prettyTime(b.startTime)}–${prettyTime(b.endTime)}`).join(", ")}`;
  });

  return [
    `Hi ${r.contactFirstName || "there"},`,
    "",
    `Thanks for your reservation request for the ${r.roomLabel} at ${r.propertyName} on ${prettyDate(r.date)} from ${prettyTime(r.startTime)} to ${prettyTime(r.endTime)}.`,
    "",
    `Unfortunately that slot isn't available${conflicts.length > 0 ? " — we already have:" : "."}`,
    ...conflicts,
    "",
    "Other options on that day:",
    ...roomLines,
    "",
    "Could you either pick another time, or one of the other rooms? Just reply with what works and we'll get it locked in.",
    "",
    "Thanks,",
    sender,
    "KCP Property Management",
  ].join("\n");
}

function customEmailBody(r: Reservation, sender: string): string {
  return [
    `Hi ${r.contactFirstName || "there"},`,
    "",
    `Re: your reservation for the ${r.roomLabel} at ${r.propertyName} on ${prettyDate(r.date)} (${prettyTime(r.startTime)}–${prettyTime(r.endTime)}).`,
    "",
    "[ Add your message here ]",
    "",
    "Thanks,",
    sender,
    "KCP Property Management",
  ].join("\n");
}

// ── shared primitives ─────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6,
  background: "var(--card)", color: "var(--text)",
  fontFamily: "inherit", fontSize: 13, outline: "none",
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", background: "transparent", border: "none",
      borderBottom: active ? "2px solid #0b4a7d" : "2px solid transparent",
      color: active ? "var(--text)" : "var(--muted)",
      fontWeight: active ? 700 : 500, fontSize: 14,
      cursor: "pointer", marginBottom: -1,
    }}>
      {children}
    </button>
  );
}

function MetaCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, wordBreak: "break-word" }}>{value || "—"}</span>
      {sub && <span style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-word" }}>{sub}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
