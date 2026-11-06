"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "../_components/icons";
import type { SiteImage, SiteListing } from "@/lib/site/content";
import { FILL } from "./shared";

// The AVAILABLE SPACE table — on a property page (one property, controls
// inline with the title) and on /available-space (every property, a heading
// per property, alphabetical). Ported from the vendor site's OfficeListings:
// a rate switch ($/SF/YR · $/SF/MO · $ Amt/YR · $ Amt/MO), rows that expand to
// the space's photos and details, a full-screen photo viewer, and a card
// layout under 768px.

export type ListingWithProperty = SiteListing & { propertyName: string };

const RATE_FORMATS = ["$/SF/YR", "$/SF/MO", "$ Amt/YR", "$ Amt/MO"] as const;
type RateFormat = (typeof RATE_FORMATS)[number];

/** The original's conversion: the number in the rate string, re-expressed. A
 *  rate with no number ("Upon Request") passes through untouched. */
function convertRentalRate(rate: string, format: RateFormat, size: number): string {
  const n = Number.parseFloat(rate.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) return rate;
  switch (format) {
    case "$/SF/YR": return `$${n.toFixed(2)}/SF/YR`;
    case "$/SF/MO": return `$${(n / 12).toFixed(2)}/SF/MO`;
    case "$ Amt/YR": return `$${(n * size).toLocaleString(undefined, { maximumFractionDigits: 0 })}/YR`;
    case "$ Amt/MO": return `$${((n * size) / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/MO`;
  }
}

const sizeLabel = (l: SiteListing) =>
  typeof l.minSize === "number" && typeof l.maxSize === "number"
    ? `${l.minSize.toLocaleString()}-${l.maxSize.toLocaleString()} SF`
    : typeof l.size === "number" ? `${l.size.toLocaleString()} SF` : "";

const rateFor = (l: SiteListing, f: RateFormat) =>
  convertRentalRate(l.rentalRate ?? "", f, typeof l.maxSize === "number" ? l.maxSize : typeof l.size === "number" ? l.size : 0);

type Cols = { showRentType: boolean; showSpaceUse: boolean; showCondition: boolean; showAvailable: boolean };
const has = (s?: string | null) => !!s && s.trim() !== "";

function ImageGalleryModal({ images, isOpen, onClose, initialIndex }: { images: SiteImage[]; isOpen: boolean; onClose: () => void; initialIndex: number }) {
  const [i, setI] = useState(initialIndex);
  const n = images.length;
  const next = () => n > 1 && setI((x) => (x + 1) % n);
  const prev = () => n > 1 && setI((x) => (x - 1 + n) % n);
  useEffect(() => { if (isOpen) setI(initialIndex); }, [isOpen, initialIndex]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setI((x) => (n > 1 ? (x - 1 + n) % n : x));
      if (e.key === "ArrowRight") setI((x) => (n > 1 ? (x + 1) % n : x));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [isOpen, onClose, n]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close gallery"
          className="absolute top-4 right-4 bg-white/80 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md transition-colors z-20">
          <X className="lucide lucide-x h-6 w-6" />
        </button>
        <div className="relative">
          {n > 0 && (
            <div className="relative" style={{ width: "85vw", height: "85vh" }}>
              <img src={images[i].url} alt={images[i].alt || `Property image ${i + 1}`} style={FILL} className="object-contain" />
            </div>
          )}
          {n > 1 && (
            <>
              <button onClick={prev} aria-label="Previous image"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 p-2 rounded-full shadow-lg transition-all duration-300 z-10">
                <ChevronLeft className="lucide lucide-chevron-left h-6 w-6" />
              </button>
              <button onClick={next} aria-label="Next image"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 p-2 rounded-full shadow-lg transition-all duration-300 z-10">
                <ChevronRight className="lucide lucide-chevron-right h-6 w-6" />
              </button>
            </>
          )}
          <div className="absolute bottom-4 right-4 bg-white/90 text-slate-800 text-sm px-3 py-1 rounded-full shadow-md z-10">{`${i + 1} / ${n}`}</div>
        </div>
      </div>
    </div>
  );
}

/** A listing's photos inside its expanded row: cross-fade, small arrows, a
 *  counter; clicking a photo opens the viewer. */
function ListingPhotos({ l, onOpen }: { l: ListingWithProperty; onOpen: (imgs: SiteImage[], i: number) => void }) {
  const [i, setI] = useState(0);
  const imgs = l.images ?? [];
  if (imgs.length === 0) return null;
  const n = imgs.length;
  return (
    <>
      {imgs.map((img, k) => (
        <div key={k} className={`absolute inset-0 transition-opacity duration-500 ${k === i ? "opacity-100" : "opacity-0"}`}
          style={{ pointerEvents: k === i ? "auto" : "none" }}
          onClick={(e) => { e.stopPropagation(); onOpen(imgs, k); }}>
          <img src={img.url} alt={img.alt || `${l.space} office space - Image ${k + 1}`} style={FILL} className="object-cover cursor-pointer" />
        </div>
      ))}
      {n > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }} aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md transition-all duration-300 z-10">
            <ChevronLeft className="lucide lucide-chevron-left h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }} aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md transition-all duration-300 z-10">
            <ChevronRight className="lucide lucide-chevron-right h-4 w-4" />
          </button>
          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full z-10">{`${i + 1} / ${n}`}</div>
        </>
      )}
    </>
  );
}

const TH = "p-3 text-left font-medium text-sm tracking-wider";
const Chevron = ({ open }: { open: boolean }) =>
  open ? <ChevronDown className="lucide lucide-chevron-down h-5 w-5 text-slate-600 transition-transform duration-200" />
    : <ChevronRight className="lucide lucide-chevron-right h-5 w-5 text-slate-600 transition-transform duration-200" />;

function Table({ listings, format, cols, onOpen }: { listings: ListingWithProperty[]; format: RateFormat; cols: Cols; onOpen: (imgs: SiteImage[], i: number) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const span = 5 + [cols.showRentType, cols.showSpaceUse, cols.showCondition, cols.showAvailable].filter(Boolean).length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-12" /><col className="w-[170px]" /><col className="w-[150px]" /><col className="w-[120px]" /><col className="w-[150px]" />
          {cols.showRentType && <col className="w-[120px]" />}
          {cols.showSpaceUse && <col className="w-[150px]" />}
          {cols.showCondition && <col className="w-[150px]" />}
          {cols.showAvailable && <col className="w-[120px]" />}
        </colgroup>
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className={TH} />
            <th className={TH}>SPACE</th>
            <th className={TH}>SIZE</th>
            <th className={TH}>TERM</th>
            <th className={TH}>RENTAL RATE</th>
            {cols.showRentType && <th className={TH}>RENT TYPE</th>}
            {cols.showSpaceUse && <th className={TH}>SPACE USE</th>}
            {cols.showCondition && <th className={TH}>CONDITION</th>}
            {cols.showAvailable && <th className={TH}>AVAILABLE</th>}
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const isOpen = !!open[l.id];
            return (
              <Fragment key={l.id}>
                <tr className="border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors bg-white"
                  onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))}>
                  <td className="p-3"><Chevron open={isOpen} /></td>
                  <td className="p-3 font-medium">{l.space}</td>
                  <td className="p-3">{sizeLabel(l)}</td>
                  <td className="p-3">{l.term}</td>
                  <td className="p-3 w-36 whitespace-nowrap overflow-hidden text-ellipsis">{rateFor(l, format)}</td>
                  {cols.showRentType && <td className="p-3">{l.rentType || <span />}</td>}
                  {cols.showSpaceUse && <td className="p-3">{l.spaceUse || <span />}</td>}
                  {cols.showCondition && <td className="p-3">{l.condition || <span />}</td>}
                  {cols.showAvailable && <td className="p-3">{l.available || <span />}</td>}
                </tr>
                <tr className="border-b border-slate-200">
                  <td colSpan={span} className="p-0">
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"}`}>
                      <div className="bg-slate-100 p-6 flex flex-col md:flex-row gap-6">
                        <div className="md:w-1/3">
                          <div className="relative aspect-[4/3] w-full overflow-hidden shadow-md bg-slate-200">
                            {isOpen && <ListingPhotos l={l} onOpen={onOpen} />}
                          </div>
                        </div>
                        <div className="md:w-2/3 flex flex-col justify-between">
                          <div>
                            <h3 className="text-xl font-medium text-slate-800 mb-4">{l.space} Details</h3>
                            <ul className="space-y-2">
                              {(l.details ?? []).map((d, k) => (
                                <li key={k} className="flex items-start">
                                  <span className="text-slate-800 mr-2">•</span>
                                  <span className="text-slate-700">{d.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {l.requestMoreInfoEmail && (
                            <div className="mt-6 text-left text-slate-700">Contact {l.requestMoreInfoEmail} for more information</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ listings, format, cols, onOpen }: { listings: ListingWithProperty[]; format: RateFormat; cols: Cols; onOpen: (imgs: SiteImage[], i: number) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const facts = (l: ListingWithProperty) => (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="text-slate-500">Term:</span><span className="ml-2 text-slate-800">{l.term}</span></div>
      <div><span className="text-slate-500">Rate:</span><span className="ml-2 text-slate-800 w-full whitespace-nowrap overflow-hidden text-ellipsis">{rateFor(l, format)}</span></div>
      {cols.showRentType && l.rentType && <div><span className="text-slate-500">Rent Type:</span><span className="ml-2 text-slate-800">{l.rentType}</span></div>}
      {cols.showSpaceUse && l.spaceUse && <div><span className="text-slate-500">Use:</span><span className="ml-2 text-slate-800">{l.spaceUse}</span></div>}
      {cols.showCondition && l.condition && <div><span className="text-slate-500">Condition:</span><span className="ml-2 text-slate-800">{l.condition}</span></div>}
      {cols.showAvailable && l.available && <div><span className="text-slate-500">Available:</span><span className="ml-2 text-slate-800">{l.available}</span></div>}
    </div>
  );
  return (
    <div className="space-y-4">
      {listings.map((l) => {
        const isOpen = !!open[l.id];
        return (
          <div key={l.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))}>
              <div>
                <h3 className="font-medium text-slate-800">{l.space}</h3>
                <p className="text-sm text-slate-600">{sizeLabel(l)}</p>
              </div>
              <div><Chevron open={isOpen} /></div>
            </div>
            {!isOpen && <div className="px-4 pb-4 pt-3 border-t border-slate-100">{facts(l)}</div>}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="px-4 pb-4 pt-4 border-t border-slate-100">{facts(l)}</div>
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <div className="relative aspect-[4/3] w-full overflow-hidden shadow-md mb-4 bg-slate-200">
                  {isOpen && <ListingPhotos l={l} onOpen={onOpen} />}
                </div>
                <h4 className="font-medium text-slate-800 mb-2">Details</h4>
                <ul className="space-y-2 mb-4">
                  {(l.details ?? []).map((d, k) => (
                    <li key={k} className="flex items-start">
                      <span className="text-slate-800 mr-2">•</span>
                      <span className="text-slate-700 text-sm">{d.text}</span>
                    </li>
                  ))}
                </ul>
                {l.requestMoreInfoEmail && (
                  <a href={`mailto:${l.requestMoreInfoEmail}?subject=Information Request: ${l.space} at ${l.propertyName}`}
                    className="block w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded transition-colors text-sm text-center">
                    Request More Information
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ListingsTable({ listings, title, hidePropertyHeaders = false, inlineControls = false, showRentType = true }: {
  listings: ListingWithProperty[];
  title?: string;
  hidePropertyHeaders?: boolean;
  inlineControls?: boolean;
  /** The property page never showed a RENT TYPE column (its query did not
   *  fetch the field); the Available Space page does. */
  showRentType?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const [format, setFormat] = useState<RateFormat>("$/SF/YR");
  const [menu, setMenu] = useState(false);
  const [viewer, setViewer] = useState<{ images: SiteImage[]; index: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);

  // One group per property, alphabetical, each showing only the columns its
  // listings fill.
  const byProperty = new Map<string, ListingWithProperty[]>();
  for (const l of listings) byProperty.set(l.propertyName, [...(byProperty.get(l.propertyName) ?? []), l]);
  const groups = [...byProperty.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([propertyName, ls]) => ({
      propertyName,
      listings: ls,
      cols: {
        showRentType: showRentType && ls.some((l) => has(l.rentType)),
        showSpaceUse: ls.some((l) => has(l.spaceUse)),
        showCondition: ls.some((l) => has(l.condition)),
        showAvailable: ls.some((l) => has(l.available)),
      },
    }));

  const onOpen = (images: SiteImage[], index: number) => setViewer({ images, index });

  const dropdown = (
    <div className="relative dropdown w-[140px]" ref={ref} onClick={() => setMenu((m) => !m)}>
      <input type="hidden" name="rateFormat" value={format} />
      <div className={`w-full border border-slate-300 rounded-md px-3 py-2 flex justify-between items-center cursor-pointer ${menu ? "border-slate-800" : "border-slate-300"}`}>
        <span className="text-slate-900">{format}</span>
        <svg className="fill-current h-4 w-4 text-slate-700" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
      <div className={`dropdown-content ${menu ? "block" : "hidden"} absolute right-0 mt-1 bg-white border border-slate-200 shadow-lg z-10 max-h-60 overflow-y-auto w-full`}>
        <div className="py-1">
          {RATE_FORMATS.map((f) => (
            <div key={f} className={`px-4 py-2 hover:bg-slate-100 cursor-pointer ${format === f ? "bg-slate-50 font-medium" : ""}`}
              onClick={(e) => { e.stopPropagation(); setFormat(f); setMenu(false); }}>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <div className="flex justify-between items-center ">
        {title && <h2 className="text-2xl font-light text-slate-800">{title}</h2>}
        {inlineControls && <div className="flex items-center">{dropdown}</div>}
      </div>
      {!inlineControls && (
        <div className="flex justify-end mb-4"><div className="flex items-center">{dropdown}</div></div>
      )}
      <div className="space-y-12">
        {groups.map((g) => (
          <div key={g.propertyName}>
            {!hidePropertyHeaders && <h3 className="text-3xl font-light text-slate-800 mb-6">{g.propertyName}</h3>}
            <div className={`bg-white ${inlineControls ? "mt-10" : ""} overflow-hidden`}>
              {mobile ? <Cards listings={g.listings} format={format} cols={g.cols} onOpen={onOpen} />
                : <Table listings={g.listings} format={format} cols={g.cols} onOpen={onOpen} />}
            </div>
          </div>
        ))}
      </div>
      <ImageGalleryModal images={viewer?.images ?? []} isOpen={!!viewer} onClose={() => setViewer(null)} initialIndex={viewer?.index ?? 0} />
    </div>
  );
}
