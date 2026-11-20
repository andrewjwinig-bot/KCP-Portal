"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteProperty } from "@/lib/site/content";
import { sitePath } from "@/lib/site/paths";
import type { PropertyBrand } from "@/lib/site/propertyBrand";
import { sizeText, spacePath, spaceSlug, type SpaceListing } from "@/lib/site/spaces";
import { ArrowRight, Check, ChevronLeft, Download } from "../../_components/icons";
import { ContactCallout, isPlan } from "../../_property/ListingsTable";
import { CompareToggle } from "../../_property/compare";
import { downloadSpaceFlyer } from "../../_property/spaceFlyer";

// A space's page (page.tsx): the plan and photos, the facts, the leasing
// contact, the inquiry form, Flyer and Compare, then the spaces like it.

const kind = (c: string) => (c === "office" ? "Office" : c === "retail" ? "Retail" : "Commercial");

export default function SpaceView({ l, property, brand, others, similar, pageUrl, propertyHref }: {
  l: SpaceListing; property: SiteProperty | null; brand: PropertyBrand | null; others: SpaceListing[];
  similar: SpaceListing[]; pageUrl: string; propertyHref: string;
}) {
  const imgs = l.images ?? [];
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const label = `${l.space} · ${l.propertyName}`;
  const flyer = async () => {
    setBusy(true);
    try { await downloadSpaceFlyer(l, pageUrl, brand); } finally { setBusy(false); }
  };
  // The auto-reply's "download the flyer" link lands here with ?flyer=1.
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (new URLSearchParams(window.location.search).get("flyer") === "1") void flyer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const facts: [string, string | null | undefined][] = [
    ["Size", sizeText(l)], ["Rental rate", l.rentalRate], ["Rent type", l.rentType], ["Term", l.term],
    ["Use", l.spaceUse], ["Condition", l.condition], ["Available", l.available],
  ];
  const town = property?.city && property?.state ? `${property.city}, ${property.state}` : property?.city ?? "";
  // Some addresses already end in the town ("… Academy Rd, Philadelphia, PA").
  const where = property?.address && town && property.address.includes(property.city ?? "\u0000") ? property.address : [property?.address, town].filter(Boolean).join(", ");

  return (
    <div className="bg-slate-50 pb-28">
      <div className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4">
          <a href={sitePath("/available-space")} className="inline-flex items-center text-slate-600 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4 mr-1" /> All available space
          </a>
        </div>
      </div>

      <section className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-10">
          <div className={brand ? "sp-head with-brand" : "sp-head"}>
          <div>
          <div className="sp-eyebrow">{kind(l.category)} space for lease{property?.city ? ` · ${property.city}, ${property.state}` : ""}</div>
          <h1 className="text-4xl md:text-5xl font-light text-slate-800 leading-tight mt-2">{l.space}</h1>
          <p className="text-lg text-slate-600 mt-2">
            at <a href={propertyHref} className="as-link">{l.propertyName}</a>{where ? ` · ${where}` : ""}
          </p>
          <div className="sp-headline">
            <span className="sp-size">{sizeText(l)}</span>
            {l.rentalRate && <span className="sp-rate">{l.rentalRate}</span>}
            {l.available && <span className="sp-rate">Available {l.available}</span>}
          </div>
          <div className="sp-actions">
            <button type="button" className="as-contact-btn primary" onClick={flyer} disabled={busy}>
              <Download className="h-4 w-4" /> {busy ? "Building flyer…" : "Download flyer"}
            </button>
            <CompareToggle slug={spaceSlug(l)} label={label} />
            <a href="#inquire" className="as-contact-btn">Ask about this space</a>
          </div>
          </div>
          {/* The property's own brand sits beside the space, not on a row of its
              own (owner: "more compact"): logo, its selling points, the link back. */}
          {brand && (
            <aside className="sp-brand-card" aria-label={`About ${brand.name}`}>
              <a href={brand.href} className="sp-brand-logo" aria-label={brand.name}>
                <img src={brand.logo.src} alt={brand.name} width={brand.logo.w} height={brand.logo.h} />
              </a>
              <ul>{brand.points.map((t) => <li key={t}><Check className="h-4 w-4" />{t}</li>)}</ul>
              <a href={brand.href} className="sp-brand-link">{brand.linkLabel} <ArrowRight className="ml-1 h-4 w-4" /></a>
            </aside>
          )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10">
        <div className="sp-grid">
          <div>
            {imgs.length > 0 && (
              <div className="sp-media">
                <div className="sp-main">
                  <img src={imgs[i].url} alt={imgs[i].alt || `${l.space} at ${l.propertyName}`}
                    className={isPlan(imgs[i].url) ? "contain" : "cover"} />
                </div>
                {imgs.length > 1 && (
                  <div className="sp-thumbs">
                    {imgs.map((im, k) => (
                      <button key={k} type="button" onClick={() => setI(k)} className={k === i ? "on" : ""} aria-label={`Show image ${k + 1}`}>
                        <img src={im.url} alt="" className={isPlan(im.url) ? "contain" : "cover"} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="sp-card">
              <h2 className="sp-h2">The space</h2>
              <dl className="sp-facts">
                {facts.filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              {(l.details ?? []).length > 0 && (
                <ul className="sp-details">
                  {(l.details ?? []).map((d, k) => <li key={k}>{d.text}</li>)}
                </ul>
              )}
            </div>
          </div>

          <aside className="sp-side">
            <ContactCallout l={l} />
            <InquiryForm l={l} />
          </aside>
        </div>

        {brand && others.length > 0 && <SpaceCards title={brand.othersLabel} spaces={others} />}
        {similar.length > 0 && <SpaceCards title="Similar spaces" spaces={similar} />}
      </div>
    </div>
  );
}

function SpaceCards({ title, spaces }: { title: string; spaces: SpaceListing[] }) {
  return (
          <section className="sp-cards">
            <h2 className="text-3xl font-light text-slate-800 mb-6">{title}</h2>
            <div className="sp-similar">
              {spaces.map((s) => {
                const pic = s.images?.find((im) => !isPlan(im.url)) ?? s.images?.[0];
                return (
                  <div key={s.id} className="sp-sim">
                    <a href={spacePath(s)} className="sp-sim-link">
                      <div className="sp-sim-img">{pic && <img src={pic.url} alt="" loading="lazy" className={isPlan(pic.url) ? "contain" : "cover"} />}</div>
                      <div className="sp-sim-body">
                        <div className="sp-sim-title">{s.space}</div>
                        <div className="text-slate-600">{s.propertyName}{s.city ? ` · ${s.city}` : ""}</div>
                        <div className="sp-sim-size">{sizeText(s)}{s.rentalRate ? ` · ${s.rentalRate}` : ""}</div>
                        <span className="sp-sim-cta">View space <ArrowRight className="ml-1 h-4 w-4" /></span>
                      </div>
                    </a>
                    <div className="sp-sim-foot"><CompareToggle slug={spaceSlug(s)} label={`${s.space} · ${s.propertyName}`} /></div>
                  </div>
                );
              })}
            </div>
          </section>
  );
}

const TIMING = ["As soon as possible", "Within 3 months", "3–6 months", "6–12 months", "Just exploring"];

function InquiryForm({ l }: { l: SpaceListing }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", timing: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending"); setErr("");
    const q = new URLSearchParams(window.location.search);
    try {
      const r = await fetch("/api/website/space-inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, slug: spaceSlug(l), source: q.get("utm_source") ?? "", referrer: document.referrer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) { setErr(j.message || "Your inquiry could not be sent. Please call or email us."); setState("error"); return; }
      setState("sent");
    } catch {
      setErr("Your inquiry could not be sent. Please call or email us."); setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div id="inquire" className="sp-card sp-sent">
        <h2 className="sp-h2">Your request is in</h2>
        <p className="text-slate-700">
          Thanks, {f.name.split(/\s+/)[0]}. {l.contactName ?? "Our leasing team"} will be in touch within one business day.
          We&apos;ve emailed you the details and the flyer for {l.space}.
        </p>
      </div>
    );
  }
  return (
    <form id="inquire" className="sp-card sp-form" onSubmit={submit}>
      <h2 className="sp-h2">Ask about this space</h2>
      <p className="text-slate-600 mb-4">We&apos;ll reply within one business day, and email you the flyer right away.</p>
      <label><span>Name</span><input required value={f.name} onChange={set("name")} autoComplete="name" /></label>
      <label><span>Company</span><input value={f.company} onChange={set("company")} autoComplete="organization" /></label>
      <label><span>Email</span><input required type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
      <label><span>Phone</span><input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></label>
      <label><span>When do you need it?</span>
        <select value={f.timing} onChange={set("timing")}>
          <option value="">Choose…</option>
          {TIMING.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label><span>Message</span><textarea rows={4} value={f.message} onChange={set("message")} placeholder="Tell us about your business and what you need" /></label>
      <input className="sp-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden="true" name="website" />
      {state === "error" && <p className="sp-err" role="alert">{err}</p>}
      <button type="submit" className="as-contact-btn primary w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send inquiry"}
      </button>
    </form>
  );
}
