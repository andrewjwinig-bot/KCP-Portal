"use client";

import { useEffect, useState } from "react";

// The inquiry form + success card (design section 10). It also enhances the
// server-rendered "Inquire" buttons in the dark Available-now band: clicking
// one presets the space <select> and jumps to #inquire, so the inquiry arrives
// attributed to a specific suite.

type Props = {
  slug: string;
  spaceOptions: string[];
};

export default function LeasingForm({ slug, spaceOptions }: Props) {
  const [sent, setSent] = useState(false);
  const [space, setSpace] = useState(spaceOptions[0] ?? "Which space?");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wire the dark-band "Inquire" buttons (server-rendered <a data-gc-space>).
  useEffect(() => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[data-gc-space]"),
    );
    const onClick = (e: Event) => {
      const el = e.currentTarget as HTMLAnchorElement;
      const val = el.getAttribute("data-gc-space");
      if (val) setSpace(val);
    };
    anchors.forEach((a) => a.addEventListener("click", onClick));
    return () => anchors.forEach((a) => a.removeEventListener("click", onClick));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      slug,
      name: data.get("name"),
      company: data.get("company"),
      email: data.get("email"),
      phone: data.get("phone"),
      space,
      message: data.get("message"),
      website: data.get("website"), // honeypot
    };
    setSubmitting(true);
    try {
      const res = await fetch("/api/leasing-inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "Something went wrong. Please try again or email us directly.");
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again or email us directly.");
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="gc-sent">
        <div className="gc-sent-h">Thanks — it&rsquo;s sent.</div>
        <div className="gc-sent-b">
          Harry will follow up within one business day with the plan set and current asking rate.
        </div>
      </div>
    );
  }

  return (
    <form className="gc-form" onSubmit={onSubmit} noValidate>
      {/* honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <div className="gc-form-grid">
        <label className="gc-vh" htmlFor="gc-name">Name</label>
        <input id="gc-name" className="gc-input" name="name" placeholder="Name" autoComplete="name" required />
        <label className="gc-vh" htmlFor="gc-company">Company</label>
        <input id="gc-company" className="gc-input" name="company" placeholder="Company" autoComplete="organization" />
        <label className="gc-vh" htmlFor="gc-email">Email</label>
        <input id="gc-email" className="gc-input" name="email" type="email" placeholder="Email" autoComplete="email" required />
        <label className="gc-vh" htmlFor="gc-phone">Phone</label>
        <input id="gc-phone" className="gc-input" name="phone" placeholder="Phone" autoComplete="tel" />
      </div>
      <label className="gc-vh" htmlFor="gc-space">Which space?</label>
      <select
        id="gc-space"
        className="gc-input gc-select"
        value={space}
        onChange={(e) => setSpace(e.target.value)}
      >
        {spaceOptions.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <label className="gc-vh" htmlFor="gc-msg">Use, size requirement, timing</label>
      <textarea
        id="gc-msg"
        className="gc-input gc-textarea"
        name="message"
        rows={4}
        placeholder="Use, size requirement, timing"
        required
      />
      {error ? <div className="gc-form-err" role="alert">{error}</div> : null}
      <div className="gc-form-foot">
        <div className="gc-form-help">
          Trade-area demographics and the full plan set are sent with the reply.
        </div>
        <button type="submit" className="gc-send" disabled={submitting}>
          {submitting ? "Sending…" : "Send inquiry"}
        </button>
      </div>
    </form>
  );
}
