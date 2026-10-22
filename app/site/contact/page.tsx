import type { Metadata } from "next";
import ContactForm from "../_contact/ContactForm";

// Contact — the vendor's page as it was: title band, the message form on the
// slate gradient, then the HQ map with the address card over it. The map is a
// keyless Google embed (the original loaded the Maps JS API with the vendor's
// key) centred on the same point and zoom.

export const metadata: Metadata = {
  title: { absolute: "Contact Us | Korman Commercial Properties" },
  description: "Get in touch with Korman Commercial Properties for inquiries about our commercial real estate services.",
};

const HQ = {
  name: "Korman Commercial Properties HQ",
  address: "8 Neshaminy Interplex Suite 400, Trevose, PA 19053",
  lat: 40.1383,
  lng: -74.9813,
  zoom: 11,
};

export default function ContactPage() {
  return (
    <div className="min-h-screen ">
      <section className="bg-white py-16 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-slate-800 h-1 w-16 mb-4" />
            <h1 className="text-5xl md:text-6xl font-light text-slate-800 leading-tight">Contact</h1>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-slate-700 to-slate-900">
        <div className="container mx-auto px-4">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <div className="bg-white/95 backdrop-blur-sm p-10 shadow-xl w-full border-t border-l border-white/20">
                <h3 className="text-2xl font-light text-slate-800 mb-8 text-center">Send Us a Message</h3>
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full relative" style={{ marginBottom: -1 }}>
        <div className="h-[60vh] md:h-[80vh] w-full overflow-hidden">
          <iframe
            title={`Map showing location of ${HQ.name}`}
            src={`https://www.google.com/maps?q=${HQ.lat},${HQ.lng}&z=${HQ.zoom}&output=embed`}
            className="w-full h-full"
            style={{ border: 0, display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="absolute top-8 right-8 bg-white shadow-lg max-w-xs w-full z-10 opacity-95 hover:opacity-100 transition-opacity">
          <div className="px-6 pt-5 pb-2">
            <h3 className="text-lg font-medium text-slate-800">Korman Commercial Properties</h3>
          </div>
          <div className="px-6 pb-5 pt-2 space-y-4">
            <div className="text-sm text-slate-700">8 Neshaminy Interplex Suite 400<br />Trevose, PA 19053</div>
            <a href="tel:2152445100" className="block text-sm text-slate-700 hover:text-slate-900">215.244.5100</a>
            <a href="mailto:info@kormancommercial.com" className="block text-sm text-slate-700 hover:text-slate-900">info@kormancommercial.com</a>
          </div>
        </div>
      </section>
    </div>
  );
}
