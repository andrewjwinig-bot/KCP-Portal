import type { Metadata } from "next";
import MaintenanceForm from "../_contact/MaintenanceForm";

// Maintenance — the vendor's page and form, now feeding the portal's own
// service-request queue (see MaintenanceForm for what changed and why).

export const metadata: Metadata = {
  title: { absolute: "Maintenance | Korman Commercial Properties" },
  description: "Get in touch with Korman Commercial Properties for inquiries about our maintenance services.",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen ">
      <section className="bg-white py-16 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="bg-slate-800 h-1 w-16 mb-4" />
            <h1 className="text-5xl md:text-6xl font-light text-slate-800 leading-tight">Maintenance</h1>
          </div>
        </div>
      </section>
      <section className="py-16 bg-slate-50 border-t border-slate-100">
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
