"use client";
// The CAM tick and the receipt for a credit-card charge — ONE control for
// Harry's Credit Card page, Greg's My Card Charges page and the dashboard's
// Charges to Code card (owner, 11/2026: "a checkbox next to charges that says
// CAM and that would move it to 8502 … make the user attach a receipt before
// finishing"). A charge is non-recoverable (-8501) unless ticked; a ticked one
// codes to -8502, goes on the property's separate CAM invoice, and is not
// finished until a receipt is attached. The receipt is stored in the portal.

import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { FileText, Paperclip, TriangleAlert, X } from "lucide-react";
import { CAM_ACCOUNT, camAllowed, needsReceipt, type Tx } from "@/lib/expenses/coding";

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** The CAM checkbox — shown only where the category and property can be CAM. */
export function CamToggle({ t, onChange }: { t: Tx; onChange: (cam: boolean) => void }) {
  if (!camAllowed(t)) return null;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-14)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
      data-tip={`Recoverable: codes to ${CAM_ACCOUNT[t.category]} and bills tenants through CAM`} className="icon-tip">
      <input type="checkbox" checked={!!t.cam} onChange={(e) => onChange(e.target.checked)} />
      CAM
    </label>
  );
}

/** Attach / view / remove the charge's receipt. Saves straight to the portal. */
export function ReceiptButton({ t, onSaved }: { t: Tx; onSaved: (tx: Tx) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const has = !!t.receipt?.url;
  const required = needsReceipt(t);

  async function attach(file: File) {
    setBusy(true); setErr(null);
    try {
      const seg = (v: string) => String(v).replace(/[^\w.\-]+/g, "_").slice(0, 80) || "receipt";
      const blob = await blobUpload(`cc-receipts/${seg(t.id)}/${seg(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/expenses/receipt/blob-upload",
        contentType: file.type || undefined,
        multipart: file.size > 8 * 1024 * 1024,
      });
      const r = await fetch("/api/expenses/receipt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, url: blob.url, name: file.name, contentType: file.type, size: file.size }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.tx) throw new Error(j.error ?? "The receipt didn't attach.");
      onSaved(j.tx);
    } catch (e: any) {
      setErr(e?.message ?? "The receipt didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/expenses/receipt?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.tx) { setErr(j.error ?? "Couldn't remove the receipt."); return; }
    onSaved(j.tx);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input ref={input} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); }} />
      {has ? (
        <>
          <a className="btn sm" style={{ textDecoration: "none" }} href={`/api/expenses/receipt?id=${encodeURIComponent(t.id)}`} target="_blank" rel="noreferrer">
            <FileText {...ICON} /> Receipt
          </a>
          <button type="button" className="btn sm" aria-label="Remove receipt" onClick={remove} disabled={busy}><X {...ICON} /></button>
        </>
      ) : (
        <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy}>
          <Paperclip {...ICON} /> {busy ? "Uploading…" : "Attach receipt"}
        </button>
      )}
      {required && !busy && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--c-b54708)", fontSize: "var(--fs-13)", fontWeight: 600 }}>
          <TriangleAlert {...ICON} /> Receipt required for CAM
        </span>
      )}
      {err && <span style={{ color: "var(--c-b42318)", fontSize: "var(--fs-13)" }}>{err}</span>}
    </span>
  );
}
