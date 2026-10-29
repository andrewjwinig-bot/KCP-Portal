"use client";

import { useEffect, useRef, useState } from "react";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { groupByPropertyType } from "@/lib/properties/typeGroups";
import { BUTTON_CLASS, Honeypot, INPUT_CLASS, LoaderCircle, TEXTAREA_CLASS } from "./ui";

// The website's Maintenance form — the vendor's layout and fields — wired into
// the PORTAL's tenant service-request intake (/api/maintenance/submit, the
// same endpoint /submit posts to), so a request lands on the Maintenance page
// with auto-triage, tenant matching and Greg's notification, instead of the
// vendor's /api/maintenance-request email. Two deliberate differences:
// - the property list is the portal's own buildings (it carries the property
//   code the intake matches the tenant against); the vendor's listed four
//   office parks by name;
// - Company is required, because the intake resolves the request to a tenant
//   by it (it was optional on the vendor's form).

const PROPERTIES = PROPERTY_DEFS
  .filter((p) => !p.entityKind && (p.type === "Office" || p.type === "Retail" || p.type === "Residential"))
  .sort((a, b) => a.name.localeCompare(b.name));
const GROUPS = groupByPropertyType(PROPERTIES, (p) => p.type);

const LABEL = "block text-sm font-medium text-slate-700";
const Req = () => <span className="text-red-500">*</span>;

type State = { submitted: boolean; submitting: boolean; error: string | null };

export default function MaintenanceForm() {
  const [s, setS] = useState<State>({ submitted: false, submitting: false, error: null });
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const picked = PROPERTIES.find((p) => p.id === code);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!picked) { setS({ submitted: false, submitting: false, error: "Please choose your property." }); return; }
    const v = (n: string) => String(new FormData(form).get(n) ?? "").trim();
    setS((x) => ({ ...x, submitting: true }));
    const building = v("buildingNumber");
    const fd = new FormData();
    fd.append("firstName", v("firstName"));
    fd.append("lastName", v("lastName"));
    fd.append("company", v("company"));
    fd.append("tenantPhone", v("phone"));
    fd.append("tenantEmail", v("email"));
    fd.append("propertyCode", picked.id);
    fd.append("propertyName", picked.name);
    fd.append("tenantSuite", v("suiteNumber"));
    fd.append("description", building ? `${v("description")}\n\nBuilding: ${building}` : v("description"));
    fd.append("website", v("website"));
    try {
      const res = await fetch("/api/maintenance/submit", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setS({ submitted: true, submitting: false, error: null });
        window.scrollTo({ top: 0, behavior: "smooth" });
        form.reset();
        setCode("");
      } else {
        setS({ submitted: false, submitting: false, error: j.error || `Submission failed: ${res.status} ${res.statusText || "Server error"}` });
      }
    } catch {
      setS({ submitted: false, submitting: false, error: "An unexpected network error occurred. Please check your connection." });
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {s.submitted && (
        <div className="bg-green-50 border border-green-200 p-6 mb-8">
          <div>
            <h3 className="text-lg font-medium text-green-900 mb-1">Request Submitted</h3>
            <p className="text-green-800">Your maintenance request has been received. Our team will address it as soon as possible.</p>
          </div>
        </div>
      )}
      {s.error && !s.submitted && (
        <div className="bg-red-50 border border-red-200 p-6 mb-8">
          <div>
            <h3 className="text-lg font-medium text-red-800 mb-1">There was a problem</h3>
            <p className="text-red-700">{s.error}</p>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-6 relative">
        <Honeypot />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="firstName" className={LABEL}>First Name<Req /></label>
            <input id="firstName" name="firstName" required className={INPUT_CLASS} disabled={s.submitting} autoComplete="given-name" />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className={LABEL}>Last Name<Req /></label>
            <input id="lastName" name="lastName" required className={INPUT_CLASS} disabled={s.submitting} autoComplete="family-name" />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="company" className={LABEL}>Company<Req /></label>
          <input id="company" name="company" required className={INPUT_CLASS} disabled={s.submitting} autoComplete="organization" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="phone" className={LABEL}>Phone<Req /></label>
            <input id="phone" name="phone" type="tel" required className={INPUT_CLASS} disabled={s.submitting} autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className={LABEL}>Email<Req /></label>
            <input id="email" name="email" type="email" required className={INPUT_CLASS} disabled={s.submitting} autoComplete="email" />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="propertyName" className={LABEL}>Property Name<Req /></label>
          <div className="relative dropdown" ref={ref} onClick={() => !s.submitting && setOpen((o) => !o)}>
            <div
              id="propertyName"
              role="button"
              tabIndex={0}
              aria-haspopup="listbox"
              aria-expanded={open}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
              className={`w-full border-0 border-b-2 ${open ? "border-slate-800" : "border-slate-300"} rounded-none px-0 py-2 flex justify-between items-center cursor-pointer ${s.submitting ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              <span className={picked ? "text-slate-900" : "text-slate-400"}>{picked?.name ?? ""}</span>
              <svg className="fill-current h-4 w-4 text-slate-700" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
            <div className={`dropdown-content ${open ? "block" : "hidden"} absolute left-0 right-0 mt-1 bg-white border border-slate-200 shadow-lg z-10 max-h-60 overflow-y-auto`} role="listbox">
              <div className="py-1">
                {GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="px-4 pt-3 text-xs uppercase tracking-wider font-semibold text-slate-400">{g.label}</div>
                    {g.items.map((p) => (
                      <div
                        key={p.id}
                        role="option"
                        aria-selected={code === p.id}
                        className={`px-4 py-2 hover:bg-slate-100 cursor-pointer ${code === p.id ? "bg-slate-50 font-medium" : ""}`}
                        onClick={() => { setCode(p.id); setOpen(false); }}
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="buildingNumber" className={LABEL}>Building Number (if applicable)</label>
            <input id="buildingNumber" name="buildingNumber" className={INPUT_CLASS} disabled={s.submitting} />
          </div>
          <div className="space-y-2">
            <label htmlFor="suiteNumber" className={LABEL}>Suite Number (if applicable)</label>
            <input id="suiteNumber" name="suiteNumber" className={INPUT_CLASS} disabled={s.submitting} />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="maintenanceNeeds" className={LABEL}>Please describe your maintenance needs<Req /></label>
          <textarea id="maintenanceNeeds" name="description" required rows={6} className={TEXTAREA_CLASS} disabled={s.submitting} />
        </div>
        <div className="flex justify-center">
          <button type="submit" className={BUTTON_CLASS} disabled={s.submitting}>
            {s.submitting ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Submitting...</>) : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
