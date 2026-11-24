import type { Metadata } from "next";
import MaintenanceForm from "../_contact/MaintenanceForm";
import { PAGE_DESCRIPTIONS, pageMeta } from "@/lib/site/seo";

// Maintenance — the vendor's page and form, now feeding the portal's own
// service-request queue (see MaintenanceForm for what changed and why).

export const metadata: Metadata = pageMeta({ absoluteTitle: "Tenant Service Requests | Korman Commercial Properties", description: PAGE_DESCRIPTIONS.maintenance, path: "/maintenance" });

export default function MaintenancePage() {
  return (
    <div className="min-h-screen ">
      <section className="bg-white site-title-band border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="bg-slate-800 h-1 w-16 mb-4" />
            <h1 className="site-h1 font-light text-slate-800 leading-tight">Service Requests</h1>
          </div>
        </div>
      </section>
      <section className="site-body bg-slate-50 border-t border-slate-100">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white p-8 shadow-md">
              <MaintenanceForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
