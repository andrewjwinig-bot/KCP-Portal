"use client";

import { useState } from "react";
import { BUTTON_CLASS, CircleAlert, Honeypot, INPUT_CLASS, LoaderCircle, TEXTAREA_CLASS } from "./ui";

// "Send Us a Message" — the vendor's form, same fields and states, posting to
// our own /api/website/contact instead of web3forms. The hCaptcha widget is
// gone; the route's honeypot + rate limit stand in for it.

type State = { submitted: boolean; submitting: boolean; error: string | null };

const LABEL = "block text-sm uppercase tracking-wider font-medium text-slate-600";

export default function ContactForm() {
  const [s, setS] = useState<State>({ submitted: false, submitting: false, error: null });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setS((x) => ({ ...x, submitting: true, submitted: false }));
    try {
      const res = await fetch("/api/website/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), message: fd.get("message"), website: fd.get("website"),
        }),
      });
      const j = await res.json().catch(() => ({ message: "An unexpected error occurred." }));
      if (res.ok && j.success) {
        setS({ submitted: true, submitting: false, error: null });
        window.scrollTo({ top: 0, behavior: "smooth" });
        form.reset();
      } else {
        setS({ submitted: false, submitting: false, error: j.message || "An error occurred" });
      }
    } catch {
      setS({ submitted: false, submitting: false, error: "An unexpected error occurred." });
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {s.submitted && (
        <div className="bg-green-50 border border-green-200 p-6 mb-8">
          <div>
            <h3 className="text-lg font-medium text-green-900 mb-1">Message Sent</h3>
            <p className="text-green-800">We will be in touch shortly.</p>
          </div>
        </div>
      )}
      {s.error && !s.submitted && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8 flex items-start">
          <CircleAlert className="h-6 w-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-medium text-red-800 mb-1">There was a problem</h3>
            <p className="text-red-700">{s.error}</p>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-8 relative">
        <Honeypot />
        <div className="space-y-2">
          <label htmlFor="name" className={LABEL}>Name</label>
          <input id="name" name="name" className={INPUT_CLASS} disabled={s.submitting} />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className={LABEL}>Email</label>
          <input id="email" name="email" type="email" className={INPUT_CLASS} disabled={s.submitting} />
        </div>
        <div className="space-y-2">
          <label htmlFor="message" className={LABEL}>Message</label>
          <textarea id="message" name="message" rows={6} className={TEXTAREA_CLASS} disabled={s.submitting} />
        </div>
        <div className="flex justify-center">
          <button type="submit" className={BUTTON_CLASS} disabled={s.submitting}>
            {s.submitting ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
