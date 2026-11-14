"use client";

// A tenant's "apply my credit" page — PUBLIC, opened from the monthly account
// notice. It shows where the credit will go and asks them to CONFIRM: opening
// the link alone never applies anything (email scanners open links). Drawn in
// the notice's own look (navy hero, lime button), not the portal's.

import { useEffect, useState } from "react";
import { AR_CONTACT_EMAIL, NOTICE_COLORS as C, type CreditPlan } from "@/lib/statements/monthlyReminder";

type View =
  | { state: "invalid" }
  | { state: "closed"; tenantName: string; deadline: string }
  | {
    state: "ready" | "done"; deadline: string; nextYM: string; tenantName: string; propertyName: string; propertyCode: string; suite: string;
    plan: CreditPlan; balanceAfter: number; stillOpen: { dateISO: string | null; description: string; amount: number }[];
    charges: number | null; requestedAt: string | null; confirmationSent: boolean;
  };

const { navy: NAVY, lime: LIME, oliveDark: OLIVE, oliveTint: TINT, ink: INK, text: TEXT, muted: MUTED, green: GREEN, hair: HAIR } = C;
const FONT = "Jost,'Century Gothic',Futura,Arial,Helvetica,sans-serif";
const AR_EMAIL = AR_CONTACT_EMAIL;
const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const date = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const short = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" }) : "");
const cap: React.CSSProperties = { fontFamily: FONT, fontSize: "var(--fs-12)", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" };

export default function CreditApplyPage({ params }: { params: { token: string } }) {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = `/api/credit-apply/${encodeURIComponent(params.token)}`;

  useEffect(() => {
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then(setV).catch(() => setV({ state: "invalid" }));
  }, [url]);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json();
      if (!r.ok && j.state !== "closed") throw new Error();
      setV(j);
    } catch { setErr(`That did not go through. Please try again, or email ${AR_EMAIL}.`); }
    finally { setBusy(false); }
  };

  const shell = (eyebrow: string, h1: string, h2: string, body: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: C.canvas, padding: "32px 12px", fontFamily: "Arial,Helvetica,sans-serif", color: TEXT }}>
      <div style={{ maxWidth: 600, margin: "0 auto", background: C.white, border: `1px solid ${C.border}` }}>
        <div style={{ padding: "26px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <img src="/site/email/korman-signature.png" alt="Korman Commercial Properties" style={{ width: 200, height: "auto" }} />
          <div style={{ ...cap, color: MUTED, fontSize: "var(--fs-11)", textAlign: "right" }}>Tenant notice<br /><span style={{ color: C.olive }}>Credit balance</span></div>
        </div>
        <div style={{ background: NAVY, padding: "30px 32px 28px" }}>
          <div style={{ ...cap, color: LIME, fontSize: "var(--fs-11)" }}>{eyebrow}</div>
          <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, lineHeight: 1.12, color: C.white, marginTop: 12 }}>{h1}<br /><span style={{ color: LIME }}>{h2}</span></div>
        </div>
        <div style={{ display: "flex", height: 6 }}>{[C.blue, C.olive, LIME, NAVY].map((c) => <div key={c} style={{ flex: 1, background: c }} />)}</div>
        <div style={{ padding: "26px 32px 30px", fontSize: 15, lineHeight: 1.55 }}>{body}</div>
        <div style={{ background: NAVY, padding: "22px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <img src="/site/email/korman-white.png" alt="Korman Commercial Properties" style={{ width: 150, height: "auto" }} />
          <div style={{ textAlign: "right", fontSize: "var(--fs-14)", color: C.onNavy }}>Questions about your account?<br /><a href={`mailto:${AR_EMAIL}`} style={{ color: LIME, fontWeight: 700, fontFamily: FONT, textDecoration: "none" }}>{AR_EMAIL}</a></div>
        </div>
      </div>
    </div>
  );

  if (!v) return shell("Korman Commercial Properties", "One moment", "…", <p style={{ color: MUTED }}>Loading your account…</p>);
  if (v.state === "invalid") return shell("Korman Commercial Properties", "This link is", "not valid.", <p>It may have been mistyped or come from an older notice. Please email <a href={`mailto:${AR_EMAIL}`}>{AR_EMAIL}</a> and we will apply your credit for you.</p>);
  if (v.state === "closed") return shell(v.tenantName, "This offer", "has closed.", <p>Requests for this notice closed on {date(v.deadline)}, when statements went out. Your credit is still on your account — email <a href={`mailto:${AR_EMAIL}`}>{AR_EMAIL}</a> and we will apply it.</p>);

  const applied = v.plan.appliedToOpen + v.plan.toNext;
  const next = monthName(v.nextYM);
  const rows: [string, number][] = [
    ...v.plan.toOpen.map((l) => [`${l.description}${l.dateISO ? ` (${short(l.dateISO)})` : ""}`, l.applied] as [string, number]),
    ...(v.plan.toNext > 0.005 ? [[`Your ${next} statement`, v.plan.toNext] as [string, number]] : []),
  ];
  const table = (
    <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 4px" }}>
      <tbody>
        {rows.map(([d, a]) => <tr key={d}><td style={{ padding: "10px 0", borderBottom: `1px solid ${HAIR}` }}>{d}</td><td style={{ padding: "10px 0", borderBottom: `1px solid ${HAIR}`, textAlign: "right", color: GREEN, fontWeight: 700, whiteSpace: "nowrap" }}>{usd(a)}</td></tr>)}
        <tr><td style={{ padding: "12px 0 0", fontFamily: FONT, fontWeight: 700, color: INK }}>Credit applied</td><td style={{ padding: "12px 0 0", textAlign: "right", fontFamily: FONT, fontWeight: 700, color: GREEN }}>{usd(applied)}</td></tr>
        {v.plan.remaining > 0.005 && <tr><td style={{ padding: "6px 0 0", fontFamily: FONT, fontWeight: 700, color: INK }}>Credit still on your account</td><td style={{ padding: "6px 0 0", textAlign: "right", fontFamily: FONT, fontWeight: 700, color: GREEN }}>{usd(v.plan.remaining)}</td></tr>}
      </tbody>
    </table>
  );
  const where = `${v.propertyName} · Suite ${v.suite}`;

  if (v.state === "done") {
    return shell(where, "Your credit", "has been applied.", <>
      <p style={{ margin: "0 0 14px" }}>Thank you{v.requestedAt ? ` — we received your request on ${date(v.requestedAt)}` : ""}. Your credit is being applied before the {next} statements go out, so your statement will already reflect it.{v.confirmationSent ? " A confirmation has been emailed to you." : ""}</p>
      {table}
      {v.balanceAfter > 0.005 && <p style={{ margin: "16px 0 0" }}>{usd(v.balanceAfter)} remains open on your account. Please include it with your {next} payment.</p>}
    </>);
  }

  return shell(where, "Apply your credit", `of ${usd(v.plan.credit)}.`, <>
    <p style={{ margin: "0 0 14px" }}><b>{v.tenantName}</b>, confirm below and we will apply your credit before the {next} statements go out, so your statement already reflects it:</p>
    {table}
    <button onClick={confirm} disabled={busy} style={{ marginTop: 22, background: LIME, color: NAVY, border: 0, padding: "14px 24px", fontSize: 16, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "Arial,Helvetica,sans-serif", borderRadius: 0 }}>
      {busy ? "Applying…" : `Confirm — apply my ${usd(applied)} credit`}
    </button>
    {err && <p style={{ color: C.red, margin: "12px 0 0" }}>{err}</p>}
    <p style={{ margin: "18px 0 0", fontSize: "var(--fs-14)", color: MUTED }}>Want it on specific charges instead? Email <a href={`mailto:${AR_EMAIL}`}>{AR_EMAIL}</a> and tell us which. Open through {date(v.deadline)}.</p>
    <div style={{ marginTop: 18, padding: "14px 16px", background: TINT, border: `1px solid ${C.olive}`, fontSize: "var(--fs-14)", color: OLIVE }}>Nothing is applied until you press Confirm.</div>
  </>);
}
