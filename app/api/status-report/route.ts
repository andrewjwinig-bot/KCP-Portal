import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import { getJSON } from "@/lib/storage";
import { EMPTY_LEASING_ACTIVITY, type LeasingActivity } from "@/lib/leasing/types";

export const runtime = "nodejs";

// ── Page geometry (landscape letter) ─────────────────────────────────────────
const PW = 792;
const PH = 612;
const M  = 36;

// pdf-lib origin is bottom-left; convert from top-left y
function py(topY: number) { return PH - topY; }

// ── Colors ────────────────────────────────────────────────────────────────────
const C_DARK  = rgb(0.059, 0.090, 0.161);
const C_MUTED = rgb(0.42,  0.45,  0.52);
const C_BRAND = rgb(0.043, 0.290, 0.490);
const C_LINE  = rgb(0.88,  0.89,  0.91);
const C_ALT   = rgb(0.975, 0.978, 0.982);
const C_HBKG  = rgb(0.96,  0.97,  0.98);

const KH_CODES = new Set(["9800","9820","9840","9860"]);
const OW_CODES = new Set(["4900"]);
const JV_III_CODES = new Set(["3610","3620","3640"]);
const NI_LLC_CODES = new Set(["4050","4060","4070","4080","40A0","40B0","40C0"]);
const SC_CODES     = new Set(["1100","2300","4500","7010","9510","7200","7300","1500","9200","5600","8200"]);
const CATEGORY_OFFICE_CODES      = new Set([...JV_III_CODES, ...NI_LLC_CODES]);
const CATEGORY_RETAIL_CODES      = new Set([...SC_CODES]);
const CATEGORY_RESIDENTIAL_CODES = new Set([...KH_CODES]);
const CATEGORY_OW_CODES          = new Set([...OW_CODES]);
function isOfficeCode(code: string): boolean {
  const c = code.toUpperCase();
  return JV_III_CODES.has(c) || NI_LLC_CODES.has(c) || OW_CODES.has(c);
}
function applyCategory(properties: any[], category: string): any[] {
  if (category === "All") return properties;
  return properties.filter((p) => {
    const c = String(p.propertyCode).toUpperCase();
    if (category === "Office")           return CATEGORY_OFFICE_CODES.has(c);
    if (category === "Retail")           return CATEGORY_RETAIL_CODES.has(c);
    if (category === "Residential")      return CATEGORY_RESIDENTIAL_CODES.has(c);
    if (category === "The Office Works") return CATEGORY_OW_CODES.has(c);
    return true;
  });
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function sqftFmt(n: number) { return n.toLocaleString("en-US"); }
function mdyToTs(s: string | null | undefined): number {
  // Convert MM/DD/YYYY → epoch ms; missing/invalid sorts to the end.
  if (!s) return Number.POSITIVE_INFINITY;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime();
}
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}
function daysUntil(d: Date): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[1].padStart(2,"0")}/${m[2].padStart(2,"0")}/${m[3].slice(2)}`;
}
function propDisplayName(code: string, fallback: string): string {
  return PROPERTY_DEFS.find(p => p.id.toUpperCase() === code.toUpperCase())?.name ?? fallback;
}
function propAddress(code: string): string | null {
  const def = PROPERTY_DEFS.find(p => p.id.toUpperCase() === code.toUpperCase());
  if (!def) return null;
  return [def.address, def.city, [def.state, def.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
function parsePeriod(reportFrom: string): string {
  const m = reportFrom?.match(/^(\d{1,2})\/\d+\/(\d{4})$/);
  if (!m) return "";
  return `${MONTHS[parseInt(m[1]) - 1]}-${m[2].slice(2)}`;
}

type ColDef = { header: string; width: number; align: "left" | "right" };

function buildCols(hideNNN: boolean, showBaseYear: boolean): ColDef[] {
  if (hideNNN) {
    return [
      { header: "Tenant",       width: 175, align: "left"  },
      { header: "Unit",         width: 60,  align: "left"  },
      { header: "Sq Ft",        width: 55,  align: "right" },
      { header: "Lease From",   width: 60,  align: "left"  },
      { header: "Lease To",     width: 60,  align: "left"  },
      ...(showBaseYear ? [{ header: "Base Year", width: 50, align: "right" as const }] : []),
      { header: "Base Rent/mo", width: 75,  align: "right" },
      { header: "Annual $/sf",  width: 55,  align: "right" },
      { header: "Gross/mo",     width: 75,  align: "right" },
    ];
  }
  return [
    { header: "Tenant",       width: showBaseYear ? 122 : 130, align: "left"  },
    { header: "Unit",         width: 53,  align: "left"  },
    { header: "Sq Ft",        width: 48,  align: "right" },
    { header: "Lease From",   width: 56,  align: "left"  },
    { header: "Lease To",     width: 56,  align: "left"  },
    ...(showBaseYear ? [{ header: "Base Year", width: 44, align: "right" as const }] : []),
    { header: "Base Rent/mo", width: 62,  align: "right" },
    { header: "Annual $/sf",  width: 50,  align: "right" },
    { header: "CAM/mo",       width: 50,  align: "right" },
    { header: "RET/mo",       width: 50,  align: "right" },
    { header: "Other/mo",     width: 50,  align: "right" },
    { header: "Gross/mo",     width: 60,  align: "right" },
  ];
}

function cellVal(col: string, unit: any, tenantMeta?: Record<string, { baseYear?: number | null }>): string {
  switch (col) {
    case "Tenant":       return unit.isVacant ? "Vacant" : (unit.occupantName || "");
    case "Unit":         return unit.unitRef || "";
    case "Sq Ft":        return sqftFmt(unit.sqft);
    case "Lease From":   return fmtDate(unit.leaseFrom);
    case "Lease To":     return fmtDate(unit.leaseTo);
    case "Base Year":    {
      if (unit.isVacant) return "—";
      const v = tenantMeta?.[unit.unitRef]?.baseYear;
      return v != null ? String(v) : "—";
    }
    case "Base Rent/mo": return unit.baseRent  ? money(unit.baseRent)  : "—";
    case "Annual $/sf":  return unit.annualRentPerSqft ? `$${unit.annualRentPerSqft.toFixed(2)}` : "—";
    case "CAM/mo":       return unit.opexMonth  ? money(unit.opexMonth)  : "—";
    case "RET/mo":       return unit.reTaxMonth ? money(unit.reTaxMonth) : "—";
    case "Other/mo":     return unit.otherMonth ? money(unit.otherMonth) : "—";
    case "Gross/mo":     return unit.grossRentTotal ? money(unit.grossRentTotal) : "—";
    default:             return "";
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { category, tenantMeta, month } = body as {
      properties?: any[];
      category: string;
      reportFrom?: string;
      tenantMeta?: Record<string, { baseYear?: number | null }>;
      month?: string; // "YYYY-MM" — when set, generate from a historical snapshot
    };
    let properties: any[];
    let fullProperties: any[];
    let reportFrom: string;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const snap = (await getJSON("rentroll-history", month)) as { properties: any[]; reportFrom?: string } | null;
      if (!snap) {
        return new NextResponse("Snapshot not found", { status: 404 });
      }
      fullProperties = snap.properties ?? [];
      properties = applyCategory(fullProperties, category);
      const [yy, mm] = month.split("-");
      reportFrom = snap.reportFrom ?? `${mm}/01/${yy}`;
    } else {
      properties = body.properties ?? [];
      reportFrom = body.reportFrom ?? "";
      // Pull the unfiltered current rent roll so the Occupancy Summary can
      // always include Office Works (4900) regardless of the category filter.
      try {
        const cur = (await getJSON("rentroll", "current")) as { properties?: any[] } | null;
        fullProperties = cur?.properties?.length ? cur.properties : properties;
      } catch {
        fullProperties = properties;
      }
    }

    const pdfDoc   = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const periodStr  = parsePeriod(reportFrom);
    const reportTitle = `${category} — ${periodStr} Status Report`;

    // Leasing activity is used by both the Lease Activity Summary page and the
    // Upcoming Lease Expirations section (for per-unit comments).
    let topLeasing: LeasingActivity = EMPTY_LEASING_ACTIVITY;
    try {
      const raw = (await getJSON("leasing-activity", "all")) as LeasingActivity | null;
      if (raw) topLeasing = { ...EMPTY_LEASING_ACTIVITY, ...raw };
    } catch { /* ignore */ }
    const expirationComments = topLeasing.expirationComments ?? {};

    const ROW_H  = 17;
    const HEAD_H = 22;

    // ── Page factory ─────────────────────────────────────────────────────────
    function newPage(): { page: PDFPage; curY: number } {
      const page = pdfDoc.addPage([PW, PH]);
      // top rule
      page.drawLine({ start: { x: M, y: py(M) }, end: { x: PW - M, y: py(M) }, thickness: 2, color: C_BRAND });
      // report title top-right
      const rtW = font.widthOfTextAtSize(reportTitle, 8);
      page.drawText(reportTitle, { x: PW - M - rtW, y: py(M + 14), size: 8, font, color: C_MUTED });
      return { page, curY: M + 22 };
    }

    // ── Draw table header row, return height consumed ────────────────────────
    function drawHeader(page: PDFPage, curY: number, cols: ColDef[], tableX: number, tableW: number) {
      page.drawRectangle({ x: tableX, y: py(curY + HEAD_H), width: tableW, height: HEAD_H, color: C_HBKG });
      page.drawLine({ start: { x: tableX, y: py(curY + HEAD_H) }, end: { x: tableX + tableW, y: py(curY + HEAD_H) }, thickness: 0.75, color: C_LINE });
      let cx = tableX;
      for (const col of cols) {
        const tw = fontBold.widthOfTextAtSize(col.header, 7.5);
        const tx = col.align === "right" ? cx + col.width - 4 - tw : cx + 4;
        page.drawText(col.header, { x: tx, y: py(curY + HEAD_H - 7), size: 7.5, font: fontBold, color: C_DARK });
        cx += col.width;
      }
      return HEAD_H;
    }

    // ── Cover page ────────────────────────────────────────────────────────────
    {
      const { page } = newPage();

      // Title — two lines
      const line1 = "Neshaminy Interplex Business Center";
      const line2 = "Leasing Status Report";
      const titleSz = 24;
      const line1W = fontBold.widthOfTextAtSize(line1, titleSz);
      const line2W = fontBold.widthOfTextAtSize(line2, titleSz);
      page.drawText(line1, { x: (PW - line1W) / 2, y: py(200), size: titleSz, font: fontBold, color: C_DARK });
      page.drawText(line2, { x: (PW - line2W) / 2, y: py(232), size: titleSz, font: fontBold, color: C_DARK });

      // Period (e.g. "May 2026") below title
      const m = reportFrom?.match(/^(\d{1,2})\/\d+\/(\d{4})$/);
      const periodLong = m ? `${MONTHS_LONG[parseInt(m[1]) - 1]} ${m[2]}` : "";
      if (periodLong) {
        const plSz = 14;
        const plW = font.widthOfTextAtSize(periodLong, plSz);
        page.drawText(periodLong, { x: (PW - plW) / 2, y: py(262), size: plSz, font, color: C_BRAND });
      }

      // Summary stat boxes
      const totSqft  = properties.reduce((s: number, p: any) => s + p.totalSqft,    0);
      const totOcc   = properties.reduce((s: number, p: any) => s + p.occupiedSqft, 0);
      const totGross = properties.reduce((s: number, p: any) => s + p.units.reduce((u: number, u2: any) => u + u2.grossRentTotal, 0), 0);
      const occ      = totSqft > 0 ? (totOcc / totSqft) * 100 : 0;

      const stats = [
        { label: "Properties",    value: String(properties.length) },
        { label: "Total Sq Ft",   value: sqftFmt(totSqft)          },
        { label: "Occupancy",     value: `${occ.toFixed(1)}%`      },
        { label: "Gross Rent/mo", value: `$${Math.round(totGross).toLocaleString("en-US")}` },
      ];
      const boxW = 140;
      const boxH = 56;
      const gap  = 12;
      const startX = (PW - (stats.length * boxW + (stats.length - 1) * gap)) / 2;
      stats.forEach((s, i) => {
        const x = startX + i * (boxW + gap);
        const y = py(330);
        page.drawRectangle({ x, y: y - boxH, width: boxW, height: boxH, color: C_HBKG, borderColor: C_LINE, borderWidth: 1 });
        const vw = fontBold.widthOfTextAtSize(s.value, 15);
        page.drawText(s.value, { x: x + (boxW - vw) / 2, y: y - 24, size: 15, font: fontBold, color: C_DARK });
        const lw = font.widthOfTextAtSize(s.label, 9);
        page.drawText(s.label, { x: x + (boxW - lw) / 2, y: y - 41, size: 9, font, color: C_MUTED });
      });

      // ── Bottom-left: generated date ──
      const now = new Date();
      const generated = `Generated ${MONTHS_LONG[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      page.drawText(generated, { x: M, y: M + 10, size: 9, font, color: C_MUTED });

      // ── Bottom-right: Korman Commercial Properties wordmark ──
      const word1 = "KORMAN";
      const word2 = "COMMERCIAL";
      const word3 = "PROPERTIES";
      // KORMAN big bold
      const w1Size = 16;
      const w1W = fontBold.widthOfTextAtSize(word1, w1Size);
      // Small uppercase tagline (two stacked lines)
      const tagSize = 7;
      const tagW = Math.max(font.widthOfTextAtSize(word2, tagSize), font.widthOfTextAtSize(word3, tagSize));
      const dividerW = 1;
      const innerGap = 8;
      const totalLogoW = w1W + innerGap + dividerW + innerGap + tagW;
      const logoRight = PW - M;
      const baseY = M + 10;
      const logoLeft = logoRight - totalLogoW;
      // KORMAN
      page.drawText(word1, { x: logoLeft, y: baseY + 2, size: w1Size, font: fontBold, color: C_DARK });
      // Divider
      const divX = logoLeft + w1W + innerGap;
      page.drawLine({ start: { x: divX, y: baseY }, end: { x: divX, y: baseY + 16 }, thickness: 1, color: C_DARK });
      // Tagline lines (top: COMMERCIAL, bottom: PROPERTIES)
      const tagX = divX + innerGap;
      page.drawText(word2, { x: tagX, y: baseY + 10, size: tagSize, font, color: C_DARK });
      page.drawText(word3, { x: tagX, y: baseY + 2,  size: tagSize, font, color: C_DARK });
    }

    // ── Occupancy Summary page (Office buildings — JV III + NI LLC + 4900) ───
    {
      const includeCodes = new Set([...JV_III_CODES, ...NI_LLC_CODES, ...OW_CODES]);
      const officeProps = fullProperties.filter((p: any) => includeCodes.has(String(p.propertyCode).toUpperCase()));

      // Pull leasing-activity to compute Pending + Vacating per property
      let leasingForSummary: LeasingActivity = EMPTY_LEASING_ACTIVITY;
      try {
        const raw = (await getJSON("leasing-activity", "all")) as LeasingActivity | null;
        if (raw) leasingForSummary = { ...EMPTY_LEASING_ACTIVITY, ...raw };
      } catch { /* default empty */ }

      const BUILDING_LABEL_TO_CODE: Record<string, string> = {
        "1": "3610", "2": "3620", "4": "3640",
        "5": "4050", "6": "4060", "7": "4070", "8": "4080",
        "Kor A": "40A0", "Kor B": "40B0", "Kor C": "40C0",
        "Office Works": "4900",
      };
      function buildingLabelToCode(label: string): string | null {
        const trimmed = (label ?? "").trim();
        // Multi-building labels like "1,6,8" — only count if single building
        if (trimmed.includes(",")) return null;
        return BUILDING_LABEL_TO_CODE[trimmed] ?? null;
      }
      type DeltaRow = { pendingSuites: number; pendingSqft: number; vacatingSuites: number; vacatingSqft: number };
      const emptyDelta = (): DeltaRow => ({ pendingSuites: 0, pendingSqft: 0, vacatingSuites: 0, vacatingSqft: 0 });
      const deltaByCode: Record<string, DeltaRow> = {};
      for (const p of leasingForSummary.pendingLeases) {
        const code = buildingLabelToCode(p.building);
        if (!code) continue;
        const d = (deltaByCode[code] ??= emptyDelta());
        d.pendingSuites += 1;
        d.pendingSqft += p.sqft || 0;
      }
      for (const v of leasingForSummary.tenantsVacating) {
        // Prefer linked unitRef → resolve to property code; otherwise use the
        // typed building label.
        let code: string | null = null;
        if (v.unitRef) code = v.unitRef.split("-")[0].toUpperCase();
        if (!code) code = buildingLabelToCode(v.building);
        if (!code) continue;
        const d = (deltaByCode[code] ??= emptyDelta());
        d.vacatingSuites += 1;
        d.vacatingSqft += v.sqft || 0;
      }
      function deltaFor(codes: Set<string>): DeltaRow {
        const out = emptyDelta();
        for (const c of codes) {
          const d = deltaByCode[c];
          if (!d) continue;
          out.pendingSuites += d.pendingSuites;
          out.pendingSqft += d.pendingSqft;
          out.vacatingSuites += d.vacatingSuites;
          out.vacatingSqft += d.vacatingSqft;
        }
        return out;
      }
      if (officeProps.length) {
        type Row = { code: string; name: string; total: number; occSuites: number; occSqft: number; vacSuites: number; vacSqft: number };
        function tally(prop: any): Row {
          let occSuites = 0, occSqft = 0, vacSuites = 0, vacSqft = 0;
          for (const u of prop.units) {
            if (u.isVacant) { vacSuites++; vacSqft += u.sqft; }
            else            { occSuites++; occSqft += u.sqft; }
          }
          const code = String(prop.propertyCode).toUpperCase();
          return {
            code,
            name: propDisplayName(code, prop.reportedPropertyName || code),
            total: prop.totalSqft,
            occSuites, occSqft, vacSuites, vacSqft,
          };
        }
        function sumRows(rows: Row[]): Row {
          return rows.reduce((acc, r) => ({
            code: "", name: "",
            total:     acc.total     + r.total,
            occSuites: acc.occSuites + r.occSuites,
            occSqft:   acc.occSqft   + r.occSqft,
            vacSuites: acc.vacSuites + r.vacSuites,
            vacSqft:   acc.vacSqft   + r.vacSqft,
          }), { code: "", name: "", total: 0, occSuites: 0, occSqft: 0, vacSuites: 0, vacSqft: 0 });
        }
        function pctOf(part: number, whole: number): string {
          if (whole === 0) return "0%";
          return `${Math.round((part / whole) * 100)}%`;
        }

        const allRows = officeProps.map(tally);
        const jvRows = allRows.filter(r => JV_III_CODES.has(r.code));
        const niRows = allRows.filter(r => NI_LLC_CODES.has(r.code));
        const owRows = allRows.filter(r => OW_CODES.has(r.code));

        // Building order to match the requested layout
        const NI_ORDER = ["40A0", "40B0", "40C0", "4050", "4060", "4070", "4080"];
        jvRows.sort((a, b) => a.code.localeCompare(b.code));
        niRows.sort((a, b) => {
          const ai = NI_ORDER.indexOf(a.code); const bi = NI_ORDER.indexOf(b.code);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        const jvTotal    = sumRows(jvRows);
        const niTotal    = sumRows(niRows);
        const grandTotal = sumRows([...jvRows, ...niRows]); // Office Works tabulated separately below

        // ── Page setup
        const page = pdfDoc.addPage([PW, PH]);
        page.drawLine({ start: { x: M, y: py(M) }, end: { x: PW - M, y: py(M) }, thickness: 2, color: C_BRAND });
        // Period top right
        const periodTopRight = periodStr || "####";
        const prW = fontBold.widthOfTextAtSize(periodTopRight, 11);
        page.drawText(periodTopRight, { x: PW - M - prW, y: py(M + 14), size: 11, font: fontBold, color: C_DARK });

        // Title + subtitle
        const title = "Occupancy Summary Report";
        const titleSz = 22;
        const titleW = fontBold.widthOfTextAtSize(title, titleSz);
        page.drawText(title, { x: (PW - titleW) / 2, y: py(M + 40), size: titleSz, font: fontBold, color: C_DARK });
        const subtitle = "Neshaminy Interplex Status Report";
        const subSz = 10;
        const subW = font.widthOfTextAtSize(subtitle, subSz);
        page.drawText(subtitle, { x: (PW - subW) / 2, y: py(M + 60), size: subSz, font, color: C_BRAND });

        // ── Table layout
        const labelW = 100;
        const totW   = 60;
        const grpW   = 135;            // # Suites + Sq Ft + %
        const grpSubW = [42, 60, 33];  // child widths
        const tableW = labelW + totW + grpW * 3;
        const tableX = (PW - tableW) / 2;
        const ROW_H_LOC = 18;

        const grpStartXs = [
          tableX + labelW + totW,
          tableX + labelW + totW + grpW,
          tableX + labelW + totW + grpW * 2,
        ];

        function drawGroupHeaders(yTop: number, pendingHeader: boolean) {
          const labels = ["Total", "Occupied", "Vacant", pendingHeader ? "W/ Pending & Vacating*" : "Occupied"];
          // "Total" sits over the totW column; the others over each grpW column
          const xs = [tableX + labelW + totW / 2, ...grpStartXs.map(x => x + grpW / 2)];
          for (let i = 0; i < labels.length; i++) {
            const lab = labels[i];
            const tw = fontBold.widthOfTextAtSize(lab, 9);
            page.drawText(lab, { x: xs[i] - tw / 2, y: py(yTop + 12), size: 9, font: fontBold, color: C_DARK });
          }
        }

        function drawColumnHeaders(yTop: number) {
          // First group has "Sq. Ft" only, subsequent ones have # Suites / Sq. Ft / %
          // Total column header
          const totHdr = "Sq. Ft";
          const tw = font.widthOfTextAtSize(totHdr, 8);
          page.drawText(totHdr, { x: tableX + labelW + totW - 6 - tw, y: py(yTop + 11), size: 8, font, color: C_MUTED });
          // Group sub-column headers
          const subHdrs = ["# Suites", "Sq. Ft", "%"];
          for (const grpX of grpStartXs) {
            let cx = grpX;
            for (let i = 0; i < subHdrs.length; i++) {
              const w = grpSubW[i];
              const lab = subHdrs[i];
              const lw = font.widthOfTextAtSize(lab, 8);
              page.drawText(lab, { x: cx + w - 6 - lw, y: py(yTop + 11), size: 8, font, color: C_MUTED });
              cx += w;
            }
          }
        }

        // Slightly darker than the global C_ALT for better readability on this page.
        const ROW_ALT_BG = rgb(0.91, 0.92, 0.93);

        // Vertical gridlines only at the four boundaries from the source
        // report: after the 2nd column (Total Sq Ft), 5th column (Occupied %),
        // 8th column (Vacant %), and the right edge (after Pending %).
        const groupDividerXs = [
          tableX + labelW + totW,       // after Total (col 2)
          grpStartXs[1],                // after Occupied (col 5)
          grpStartXs[2],                // after Vacant (col 8)
          tableX + tableW,              // right edge (col 11)
        ];
        function drawTableVerticals(topY: number, bottomY: number) {
          // Extend a couple of points above the group-header band so the
          // verticals visibly clear the header text.
          const startY = topY - 2;
          for (const bx of groupDividerXs) {
            page.drawLine({ start: { x: bx, y: py(startY) }, end: { x: bx, y: py(bottomY) }, thickness: 0.5, color: C_LINE });
          }
        }

        function drawDataRow(yTop: number, label: string, row: Row, alt: boolean, bold: boolean, delta?: DeltaRow) {
          if (alt) {
            page.drawRectangle({ x: tableX, y: py(yTop + ROW_H_LOC), width: tableW, height: ROW_H_LOC, color: ROW_ALT_BG });
          }
          const f = bold ? fontBold : font;
          // Label
          page.drawText(label, { x: tableX + 6, y: py(yTop + ROW_H_LOC - 5), size: 9, font: f, color: C_DARK });
          // Total Sq Ft
          const totVal = sqftFmt(row.total);
          const totW2 = f.widthOfTextAtSize(totVal, 9);
          page.drawText(totVal, { x: tableX + labelW + totW - 6 - totW2, y: py(yTop + ROW_H_LOC - 5), size: 9, font: f, color: C_DARK });
          // Group cells: Occupied | Vacant | W/ Pending & Vacating
          const d = delta ?? emptyDelta();
          const pendingSuites  = row.occSuites + d.pendingSuites - d.vacatingSuites;
          const pendingSqft    = row.occSqft + d.pendingSqft - d.vacatingSqft;
          const groups: [number, number, number][] = [
            [row.occSuites, row.occSqft, Math.round((row.occSqft / Math.max(row.total, 1)) * 100)],
            [row.vacSuites, row.vacSqft, Math.round((row.vacSqft / Math.max(row.total, 1)) * 100)],
            [pendingSuites, pendingSqft, Math.round((pendingSqft / Math.max(row.total, 1)) * 100)],
          ];
          for (let i = 0; i < grpStartXs.length; i++) {
            const [s, sf, p] = groups[i];
            const vals = [String(s), sqftFmt(sf), `${p}%`];
            let cx = grpStartXs[i];
            for (let j = 0; j < vals.length; j++) {
              const w = grpSubW[j];
              const tw = f.widthOfTextAtSize(vals[j], 9);
              page.drawText(vals[j], { x: cx + w - 6 - tw, y: py(yTop + ROW_H_LOC - 5), size: 9, font: f, color: C_DARK });
              cx += w;
            }
          }
        }

        // ── Table 1: Entity ──
        let curY = M + 90;
        const t1Top = curY;
        // Group header bar
        drawGroupHeaders(curY, true);
        curY += 16;
        // Column header row + Entity label
        const entHdr = "Entity";
        page.drawText(entHdr, { x: tableX + 6, y: py(curY + 11), size: 8, font, color: C_MUTED });
        drawColumnHeaders(curY);
        curY += 16;
        // Bottom rule under headers
        page.drawLine({ start: { x: tableX, y: py(curY) }, end: { x: tableX + tableW, y: py(curY) }, thickness: 0.5, color: C_DARK });

        const entityRows: { label: string; row: Row; delta: DeltaRow }[] = [];
        if (jvRows.length) entityRows.push({ label: "JVIII LLC",     row: jvTotal, delta: deltaFor(JV_III_CODES) });
        if (niRows.length) entityRows.push({ label: "Neshaminy LLC", row: niTotal, delta: deltaFor(NI_LLC_CODES) });
        const allOfficeCodes = new Set<string>([...JV_III_CODES, ...NI_LLC_CODES]);
        const grandDelta = deltaFor(allOfficeCodes);

        for (let i = 0; i < entityRows.length; i++) {
          drawDataRow(curY, entityRows[i].label, entityRows[i].row, i % 2 === 0, false, entityRows[i].delta);
          curY += ROW_H_LOC;
        }
        // Total row
        page.drawLine({ start: { x: tableX, y: py(curY) }, end: { x: tableX + tableW, y: py(curY) }, thickness: 0.5, color: C_DARK });
        drawDataRow(curY, "TOTAL:", grandTotal, false, true, grandDelta);
        drawTableVerticals(t1Top, curY + ROW_H_LOC);
        curY += ROW_H_LOC + 14;

        // ── Table 2: Building ──
        const t2Top = curY;
        drawGroupHeaders(curY, false);
        curY += 16;
        page.drawText("Building", { x: tableX + 6, y: py(curY + 11), size: 8, font, color: C_MUTED });
        drawColumnHeaders(curY);
        curY += 16;
        page.drawLine({ start: { x: tableX, y: py(curY) }, end: { x: tableX + tableW, y: py(curY) }, thickness: 0.5, color: C_DARK });

        const buildingRows: { label: string; row: Row; delta: DeltaRow }[] = [];
        for (const r of jvRows) buildingRows.push({ label: r.name, row: r, delta: deltaFor(new Set([r.code])) });
        for (const r of niRows) buildingRows.push({ label: r.name, row: r, delta: deltaFor(new Set([r.code])) });

        for (let i = 0; i < buildingRows.length; i++) {
          drawDataRow(curY, buildingRows[i].label, buildingRows[i].row, i % 2 === 0, false, buildingRows[i].delta);
          curY += ROW_H_LOC;
        }
        page.drawLine({ start: { x: tableX, y: py(curY) }, end: { x: tableX + tableW, y: py(curY) }, thickness: 0.5, color: C_DARK });
        drawDataRow(curY, "TOTAL:", grandTotal, false, true, grandDelta);
        drawTableVerticals(t2Top, curY + ROW_H_LOC);
        curY += ROW_H_LOC + 14;

        // ── Table 3: The Office Works (4900) ──
        if (owRows.length) {
          const t3Top = curY;
          drawGroupHeaders(curY, false);
          curY += 16;
          page.drawText("Entity", { x: tableX + 6, y: py(curY + 11), size: 8, font, color: C_MUTED });
          drawColumnHeaders(curY);
          curY += 16;
          page.drawLine({ start: { x: tableX, y: py(curY) }, end: { x: tableX + tableW, y: py(curY) }, thickness: 0.5, color: C_DARK });
          for (let i = 0; i < owRows.length; i++) {
            const owDelta = deltaFor(new Set([owRows[i].code]));
            drawDataRow(curY, "Office Works", owRows[i], i % 2 === 0, false, owDelta);
            curY += ROW_H_LOC;
          }
          drawTableVerticals(t3Top, curY);
          curY += 8;
        }

        // Footnote
        page.drawText(
          "* Occupied Space + Pending Leases - Tenants Vacating. See Leasing Activity Summary Report for detail.",
          { x: tableX, y: py(curY + 10), size: 8, font, color: C_MUTED },
        );
      }
    }

    // ── Leasing Activity Summary page (Office only) ─────────────────────────
    {
      const includeCodes = new Set([...JV_III_CODES, ...NI_LLC_CODES, ...OW_CODES]);
      const officePresent = properties.some((p: any) => includeCodes.has(String(p.propertyCode).toUpperCase()));

      let leasing: LeasingActivity = EMPTY_LEASING_ACTIVITY;
      try {
        const raw = (await getJSON("leasing-activity", "all")) as LeasingActivity | null;
        if (raw) leasing = { ...EMPTY_LEASING_ACTIVITY, ...raw };
      } catch { /* default empty */ }

      const hasData =
        leasing.prospects.length > 0 ||
        leasing.pendingLeases.length > 0 ||
        leasing.tenantsVacating.length > 0 ||
        leasing.optionsToRenew.length > 0;

      if (officePresent && hasData) {
        // Build unit lookup so vacating/option rows can resolve tenant info
        const unitLookup = new Map<string, { tenant: string; building: string; sqft: number }>();
        for (const prop of properties) {
          const code = String(prop.propertyCode).toUpperCase();
          if (!includeCodes.has(code)) continue;
          const buildingName = propDisplayName(code, prop.reportedPropertyName || code);
          for (const u of prop.units as any[]) {
            unitLookup.set(u.unitRef, {
              tenant: u.isVacant ? "Vacant" : u.occupantName,
              building: buildingName,
              sqft: u.sqft,
            });
          }
        }

        let page: PDFPage = pdfDoc.addPage([PW, PH]);
        page.drawLine({ start: { x: M, y: py(M) }, end: { x: PW - M, y: py(M) }, thickness: 2, color: C_BRAND });
        // Period top right
        const prW = fontBold.widthOfTextAtSize(periodStr || "####", 11);
        page.drawText(periodStr || "####", { x: PW - M - prW, y: py(M + 14), size: 11, font: fontBold, color: C_DARK });

        // Title + subtitle
        const title = "Leasing Activity Summary Report";
        const titleSz = 22;
        const titleW = fontBold.widthOfTextAtSize(title, titleSz);
        page.drawText(title, { x: (PW - titleW) / 2, y: py(M + 40), size: titleSz, font: fontBold, color: C_DARK });
        const subtitle = "Neshaminy Interplex Status Report";
        const subSz = 10;
        const subW = font.widthOfTextAtSize(subtitle, subSz);
        page.drawText(subtitle, { x: (PW - subW) / 2, y: py(M + 60), size: subSz, font, color: C_BRAND });

        let curY = M + 80;
        const tableX = M + 6;
        const tableW = PW - 2 * M - 12;

        function newContinuationPage() {
          page = pdfDoc.addPage([PW, PH]);
          page.drawLine({ start: { x: M, y: py(M) }, end: { x: PW - M, y: py(M) }, thickness: 2, color: C_BRAND });
          curY = M + 14;
        }

        function pageBreakIfNeeded(spaceNeeded: number) {
          if (curY + spaceNeeded > PH - M - 10) newContinuationPage();
        }

        function drawSectionTitle(text: string) {
          pageBreakIfNeeded(22);
          page.drawText(text + ":", { x: M, y: py(curY + 12), size: 11, font: fontBold, color: C_DARK });
          curY += 14;
          page.drawLine({ start: { x: M, y: py(curY) }, end: { x: PW - M, y: py(curY) }, thickness: 0.6, color: C_LINE });
          curY += 6;
        }

        function drawRow(cols: { label: string; align: "left" | "right" | "center"; width: number }[], values: string[], opts?: { bold?: boolean; muted?: boolean; bg?: import("pdf-lib").RGB }) {
          const f = opts?.bold ? fontBold : font;
          const color = opts?.muted ? C_MUTED : C_DARK;
          if (opts?.bg) {
            const totW = cols.reduce((s, c) => s + c.width, 0);
            page.drawRectangle({ x: tableX, y: py(curY + 14), width: totW, height: 14, color: opts.bg });
          }
          let cx = tableX;
          for (let i = 0; i < cols.length; i++) {
            const c = cols[i];
            const v = values[i] ?? "";
            const tw = f.widthOfTextAtSize(v, 9);
            const tx = c.align === "right"  ? cx + c.width - 6 - tw
                     : c.align === "center" ? cx + (c.width - tw) / 2
                     :                        cx + 6;
            page.drawText(v, { x: tx, y: py(curY + 11), size: 9, font: f, color });
            cx += c.width;
          }
          curY += 14;
        }

        function noticeBg(noticeDate: string | null | undefined): import("pdf-lib").RGB | undefined {
          const ms = mdyToTs(noticeDate);
          if (!Number.isFinite(ms)) return undefined;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const days = Math.round((ms - today.getTime()) / 86400000);
          if (days < 0)   return rgb(0.95, 0.78, 0.78); // strong red wash for past-due
          if (days <= 30) return rgb(0.97, 0.86, 0.86);
          if (days <= 60) return rgb(0.98, 0.89, 0.80);
          if (days <= 90) return rgb(0.99, 0.93, 0.83);
          return undefined;
        }

        // ── Prospects
        {
          drawSectionTitle("Prospects");
          const cols = [
            { label: "Tenant",        align: "left"   as const, width: 200 },
            { label: "Building",      align: "center" as const, width: 65  },
            { label: "SQ. FT.",       align: "right"  as const, width: 70  },
            { label: "Type of",       align: "left"   as const, width: 130 },
            { label: "Rating (1-5)",  align: "center" as const, width: 90  },
          ];
          drawRow(cols, cols.map(c => c.label), { bold: true });
          page.drawLine({ start: { x: tableX, y: py(curY - 2) }, end: { x: tableX + tableW, y: py(curY - 2) }, thickness: 0.4, color: C_LINE });
          if (leasing.prospects.length === 0) {
            drawRow(cols, ["—", "", "", "", ""], { muted: true });
          } else {
            for (const p of leasing.prospects) {
              pageBreakIfNeeded(16);
              drawRow(cols, [
                p.tenant ?? "",
                p.building ?? "",
                p.sqft ? sqftFmt(p.sqft) : "",
                p.typeOf ?? "",
                p.rating != null ? String(p.rating) : "",
              ]);
            }
          }
          curY += 6;
        }

        // ── Pending Leases
        {
          pageBreakIfNeeded(40);
          drawSectionTitle("Pending Leases");
          const cols = [
            { label: "Tenant",     align: "left"   as const, width: 200 },
            { label: "Building",   align: "center" as const, width: 65  },
            { label: "SQ. FT.",    align: "right"  as const, width: 70  },
            { label: "Start Date", align: "left"   as const, width: 110 },
          ];
          drawRow(cols, cols.map(c => c.label), { bold: true });
          page.drawLine({ start: { x: tableX, y: py(curY - 2) }, end: { x: tableX + tableW, y: py(curY - 2) }, thickness: 0.4, color: C_LINE });
          if (leasing.pendingLeases.length === 0) {
            drawRow(cols, ["—", "", "", ""], { muted: true });
          } else {
            for (const p of leasing.pendingLeases) {
              pageBreakIfNeeded(16);
              drawRow(cols, [
                p.tenant ?? "",
                p.building ?? "",
                p.sqft ? sqftFmt(p.sqft) : "",
                fmtDate(p.startDate),
              ]);
            }
          }
          curY += 6;
        }

        // ── Tenants Vacating
        {
          pageBreakIfNeeded(40);
          drawSectionTitle("Tenants Vacating");
          const cols = [
            { label: "Tenant",          align: "left"   as const, width: 200 },
            { label: "Building",        align: "center" as const, width: 65  },
            { label: "SQ. FT.",         align: "right"  as const, width: 70  },
            { label: "Suite",           align: "center" as const, width: 90  },
            { label: "Expiration Date", align: "left"   as const, width: 110 },
          ];
          drawRow(cols, cols.map(c => c.label), { bold: true });
          page.drawLine({ start: { x: tableX, y: py(curY - 2) }, end: { x: tableX + tableW, y: py(curY - 2) }, thickness: 0.4, color: C_LINE });
          if (leasing.tenantsVacating.length === 0) {
            drawRow(cols, ["—", "", "", "", ""], { muted: true });
          } else {
            const vacatingSorted = leasing.tenantsVacating.slice().sort((a, b) => mdyToTs(a.expirationDate) - mdyToTs(b.expirationDate));
            for (const v of vacatingSorted) {
              const auto = v.unitRef ? unitLookup.get(v.unitRef) : null;
              pageBreakIfNeeded(16);
              drawRow(cols, [
                v.tenant   || auto?.tenant   || "",
                v.building || auto?.building || "",
                v.sqft ? sqftFmt(v.sqft) : (auto ? sqftFmt(auto.sqft) : ""),
                v.unitRef || "",
                fmtDate(v.expirationDate),
              ]);
            }
          }
          curY += 6;
        }

        // ── Option to Renew
        {
          pageBreakIfNeeded(40);
          drawSectionTitle("Option to Renew");
          const cols = [
            { label: "Tenant",              align: "left"   as const, width: 200 },
            { label: "Building",            align: "center" as const, width: 65  },
            { label: "SQ. FT.",             align: "right"  as const, width: 70  },
            { label: "Term / Prior Notice", align: "left"   as const, width: 130 },
            { label: "Notice Date",         align: "left"   as const, width: 80  },
            { label: "Option Term Exp",     align: "left"   as const, width: 90  },
          ];
          drawRow(cols, cols.map(c => c.label), { bold: true });
          page.drawLine({ start: { x: tableX, y: py(curY - 2) }, end: { x: tableX + tableW, y: py(curY - 2) }, thickness: 0.4, color: C_LINE });
          if (leasing.optionsToRenew.length === 0) {
            drawRow(cols, ["—", "", "", "", "", ""], { muted: true });
          } else {
            const optionsSorted = leasing.optionsToRenew.slice().sort((a, b) => mdyToTs(a.noticeDate) - mdyToTs(b.noticeDate));
            for (const o of optionsSorted) {
              const auto = o.unitRef ? unitLookup.get(o.unitRef) : null;
              pageBreakIfNeeded(16);
              drawRow(cols, [
                o.tenant   || auto?.tenant   || "",
                o.building || auto?.building || "",
                o.sqft ? sqftFmt(o.sqft) : (auto ? sqftFmt(auto.sqft) : ""),
                o.term ?? "",
                fmtDate(o.noticeDate),
                fmtDate(o.optionTermExp),
              ], { bg: noticeBg(o.noticeDate) });
            }
          }
        }
      }
    }

    // ── Upcoming Lease Expirations summary ───────────────────────────────────
    {
      type ExpRow = { propName: string; tenant: string; unit: string; sqft: number; leaseTo: string; days: number };
      const buckets: { label: string; min: number; max: number; rows: ExpRow[] }[] = [
        { label: "Three Month Expirations",          min: 0,   max: 90,  rows: [] },
        { label: "Four – Six Month Expirations",     min: 91,  max: 180, rows: [] },
        { label: "Seven – Twelve Month Expirations", min: 181, max: 365, rows: [] },
      ];

      for (const prop of properties) {
        const name = propDisplayName((prop.propertyCode as string).toUpperCase(), prop.reportedPropertyName || prop.propertyCode);
        for (const unit of prop.units as any[]) {
          if (unit.isVacant) continue;
          if (!unit.leaseTo) continue;
          if (unit.baseRent === 0 && unit.grossRentTotal === 0) continue;
          const d = parseDate(unit.leaseTo);
          if (!d) continue;
          const days = daysUntil(d);
          // Skip past-due and beyond 12 months.
          if (days < 0 || days > 365) continue;
          const bucket = buckets.find(b => days >= b.min && days <= b.max);
          if (bucket) bucket.rows.push({ propName: name, tenant: unit.occupantName || "", unit: unit.unitRef || "", sqft: unit.sqft, leaseTo: fmtDate(unit.leaseTo), days });
        }
      }
      // Sort each bucket by days ascending
      for (const b of buckets) b.rows.sort((a, b2) => a.days - b2.days);

      const hasAny = buckets.some(b => b.rows.length > 0);
      if (hasAny) {
        const EXP_COLS: ColDef[] = [
          { header: "Property",      width: 125, align: "left"  },
          { header: "Tenant",        width: 165, align: "left"  },
          { header: "Unit",          width: 65,  align: "left"  },
          { header: "Sq Ft",         width: 55,  align: "right" },
          { header: "Lease Expires", width: 80,  align: "left"  },
          { header: "Tenant Status", width: 125, align: "left"  },
        ];
        const tableW = EXP_COLS.reduce((s, c) => s + c.width, 0);
        const tableX = (PW - tableW) / 2;

        let { page, curY } = newPage();

        // Section title
        page.drawText("Upcoming Lease Expirations", { x: M, y: py(curY + 18), size: 16, font: fontBold, color: C_DARK });
        curY += 28;

        let grandTenants = 0;
        let grandSqft    = 0;

        for (const bucket of buckets) {
          if (!bucket.rows.length) continue;

          // Bucket header — ensure room
          if (curY + 24 > PH - M - 10) { ({ page, curY } = newPage()); }

          // Bucket label bar
          page.drawRectangle({ x: M, y: py(curY + 20), width: PW - 2 * M, height: 20, color: C_BRAND });
          page.drawText(bucket.label, { x: M + 6, y: py(curY + 14), size: 9, font: fontBold, color: rgb(1,1,1) });
          curY += 24;

          // Column headers
          curY += drawHeader(page, curY, EXP_COLS, tableX, tableW);

          let bucketSqft = 0;
          for (let i = 0; i < bucket.rows.length; i++) {
            if (curY + ROW_H > PH - M - 26) {
              ({ page, curY } = newPage());
              curY += drawHeader(page, curY, EXP_COLS, tableX, tableW);
            }
            const row = bucket.rows[i];
            bucketSqft += row.sqft;
            if (i % 2 === 1) page.drawRectangle({ x: tableX, y: py(curY + ROW_H), width: tableW, height: ROW_H, color: C_ALT });
            const comment = expirationComments[row.unit] ?? {};
            const vals: Record<string, string> = {
              "Property": row.propName, "Tenant": row.tenant, "Unit": row.unit,
              "Sq Ft": sqftFmt(row.sqft), "Lease Expires": row.leaseTo,
              "Tenant Status": comment.tenantStatus ?? "",
            };
            let cx = tableX;
            for (const col of EXP_COLS) {
              const val = vals[col.header] || "";
              const tw  = font.widthOfTextAtSize(val, 8);
              const tx  = col.align === "right" ? cx + col.width - 4 - tw : cx + 4;
              page.drawText(val, { x: tx, y: py(curY + ROW_H - 5), size: 8, font: col.header === "Tenant" ? fontBold : font, color: C_DARK });
              cx += col.width;
            }
            page.drawLine({ start: { x: tableX, y: py(curY + ROW_H) }, end: { x: tableX + tableW, y: py(curY + ROW_H) }, thickness: 0.2, color: C_LINE });
            curY += ROW_H;
          }

          // Bucket subtotal
          if (curY + ROW_H > PH - M - 10) { ({ page, curY } = newPage()); }
          page.drawLine({ start: { x: tableX, y: py(curY + 1) }, end: { x: tableX + tableW, y: py(curY + 1) }, thickness: 1.2, color: C_DARK });
          page.drawRectangle({ x: tableX, y: py(curY + ROW_H + 1), width: tableW, height: ROW_H, color: C_HBKG });
          const subLabel = `${bucket.rows.length} tenant${bucket.rows.length !== 1 ? "s" : ""}   ·   ${sqftFmt(bucketSqft)} sf`;
          const subW = fontBold.widthOfTextAtSize(subLabel, 8);
          page.drawText(subLabel, { x: tableX + tableW - 4 - subW, y: py(curY + ROW_H - 4), size: 8, font: fontBold, color: C_DARK });
          curY += ROW_H + 10;

          grandTenants += bucket.rows.length;
          grandSqft    += bucketSqft;
        }

        // Grand total
        if (curY + 24 > PH - M - 10) { ({ page, curY } = newPage()); }
        page.drawLine({ start: { x: M, y: py(curY + 1) }, end: { x: PW - M, y: py(curY + 1) }, thickness: 1.5, color: C_DARK });
        page.drawRectangle({ x: M, y: py(curY + 22), width: PW - 2 * M, height: 22, color: C_HBKG });
        page.drawText("Total", { x: M + 6, y: py(curY + 14), size: 9, font: fontBold, color: C_DARK });
        const totLabel = `${grandTenants} tenant${grandTenants !== 1 ? "s" : ""}   ·   ${sqftFmt(grandSqft)} sf`;
        const totW = fontBold.widthOfTextAtSize(totLabel, 9);
        page.drawText(totLabel, { x: PW - M - 6 - totW, y: py(curY + 14), size: 9, font: fontBold, color: C_DARK });
      }
    }

    // ── Vacancy Summary ───────────────────────────────────────────────────────
    {
      type VacRow = { propName: string; unit: string; sqft: number };
      const rows: VacRow[] = [];
      for (const prop of properties) {
        const name = propDisplayName((prop.propertyCode as string).toUpperCase(), prop.reportedPropertyName || prop.propertyCode);
        for (const u of prop.units as any[]) {
          if (u.isVacant) rows.push({ propName: name, unit: u.unitRef || "", sqft: u.sqft });
        }
      }

      if (rows.length) {
        const VAC_COLS: ColDef[] = [
          { header: "Property", width: 200, align: "left"  },
          { header: "Unit",     width: 80,  align: "left"  },
          { header: "Sq Ft",    width: 70,  align: "right" },
        ];
        const tableW = VAC_COLS.reduce((s, c) => s + c.width, 0);
        const colGap = 24;
        const leftX  = (PW - (tableW * 2 + colGap)) / 2;
        const rightX = leftX + tableW + colGap;
        const colXs: [number, number] = [leftX, rightX];

        let { page, curY } = newPage();
        page.drawText("Vacancy Summary", { x: M, y: py(curY + 18), size: 16, font: fontBold, color: C_DARK });
        curY += 28;

        // Track per-column running Y; keep them aligned by snapping to the same starting row
        const startY = curY;
        const colY: [number, number] = [startY, startY];
        let activeCol: 0 | 1 = 0;

        // Draw initial header for both columns
        drawHeader(page, colY[0], VAC_COLS, colXs[0], tableW);
        drawHeader(page, colY[1], VAC_COLS, colXs[1], tableW);
        colY[0] += HEAD_H;
        colY[1] += HEAD_H;

        let grandUnits = 0;
        let grandSqft  = 0;

        for (let i = 0; i < rows.length; i++) {
          let y = colY[activeCol];

          // Out of room in current column?
          if (y + ROW_H > PH - M - 30) {
            if (activeCol === 0) {
              activeCol = 1;
              y = colY[1];
            } else {
              ({ page, curY } = newPage());
              colY[0] = curY;
              colY[1] = curY;
              drawHeader(page, colY[0], VAC_COLS, colXs[0], tableW);
              drawHeader(page, colY[1], VAC_COLS, colXs[1], tableW);
              colY[0] += HEAD_H;
              colY[1] += HEAD_H;
              activeCol = 0;
              y = colY[0];
            }
          }

          const xBase = colXs[activeCol];
          const row = rows[i];
          grandUnits += 1;
          grandSqft  += row.sqft;
          if (i % 2 === 1) page.drawRectangle({ x: xBase, y: py(y + ROW_H), width: tableW, height: ROW_H, color: C_ALT });
          const vals: Record<string, string> = { "Property": row.propName, "Unit": row.unit, "Sq Ft": sqftFmt(row.sqft) };
          let cx = xBase;
          for (const col of VAC_COLS) {
            const val = vals[col.header] || "";
            const tw  = font.widthOfTextAtSize(val, 8);
            const tx  = col.align === "right" ? cx + col.width - 4 - tw : cx + 4;
            page.drawText(val, { x: tx, y: py(y + ROW_H - 5), size: 8, font, color: C_DARK });
            cx += col.width;
          }
          page.drawLine({ start: { x: xBase, y: py(y + ROW_H) }, end: { x: xBase + tableW, y: py(y + ROW_H) }, thickness: 0.2, color: C_LINE });
          colY[activeCol] = y + ROW_H;
        }
        // After the loop, set curY below the deepest column for the grand-total row
        curY = Math.max(colY[0], colY[1]);

        // Grand total
        if (curY + 24 > PH - M - 10) { ({ page, curY } = newPage()); }
        page.drawLine({ start: { x: M, y: py(curY + 1) }, end: { x: PW - M, y: py(curY + 1) }, thickness: 1.5, color: C_DARK });
        page.drawRectangle({ x: M, y: py(curY + 22), width: PW - 2 * M, height: 22, color: C_HBKG });
        page.drawText("Total Vacancy", { x: M + 6, y: py(curY + 14), size: 9, font: fontBold, color: C_DARK });
        const totLabel = `${grandUnits} unit${grandUnits !== 1 ? "s" : ""}   ·   ${sqftFmt(grandSqft)} sf`;
        const totW = fontBold.widthOfTextAtSize(totLabel, 9);
        page.drawText(totLabel, { x: PW - M - 6 - totW, y: py(curY + 14), size: 9, font: fontBold, color: C_DARK });
      }
    }

    // ── Per-property sections ─────────────────────────────────────────────────
    for (const prop of properties) {
      const code    = (prop.propertyCode as string).toUpperCase();
      const units   = prop.units as any[];
      const hideNNN = KH_CODES.has(code) || OW_CODES.has(code);
      const showBaseYear = isOfficeCode(code);
      const cols    = buildCols(hideNNN, showBaseYear);
      const tableW  = cols.reduce((s, c) => s + c.width, 0);
      const tableX  = (PW - tableW) / 2;
      const name    = propDisplayName(code, prop.reportedPropertyName || code);
      const address = propAddress(code);

      let { page, curY } = newPage();

      // Property heading
      const nameStr = `${name}`;
      page.drawText(nameStr, { x: M, y: py(curY + 18), size: 16, font: fontBold, color: C_DARK });
      const codeX = M + fontBold.widthOfTextAtSize(nameStr, 16) + 8;
      page.drawText(code, { x: codeX, y: py(curY + 16), size: 10, font, color: C_MUTED });
      curY += 22;

      if (address) {
        page.drawText(address, { x: M, y: py(curY + 12), size: 9, font, color: C_MUTED });
        curY += 16;
      }

      // Stats line
      const occ      = prop.totalSqft > 0 ? (prop.occupiedSqft / prop.totalSqft) * 100 : 0;
      const propGross = units.reduce((s: number, u: any) => s + u.grossRentTotal, 0);
      const statParts = [
        `Occupied: ${sqftFmt(prop.occupiedSqft)} sf`,
        `Vacant: ${sqftFmt(prop.vacantSqft)} sf`,
        `Total: ${sqftFmt(prop.totalSqft)} sf`,
        `Occupancy: ${occ.toFixed(1)}%`,
        ...(propGross > 0 ? [`Gross: ${money(propGross)}/mo`] : []),
      ];
      page.drawText(statParts.join("   ·   "), { x: M, y: py(curY + 11), size: 9, font, color: C_MUTED });
      curY += 16;

      // Rule
      page.drawLine({ start: { x: M, y: py(curY + 2) }, end: { x: PW - M, y: py(curY + 2) }, thickness: 0.5, color: C_LINE });
      curY += 10;

      // Table header
      curY += drawHeader(page, curY, cols, tableX, tableW);

      // Unit rows
      const totSqft  = units.reduce((s: number, u: any) => s + u.sqft,           0);
      const totBase  = units.reduce((s: number, u: any) => s + u.baseRent,        0);
      const totCAM   = units.reduce((s: number, u: any) => s + u.opexMonth,       0);
      const totRET   = units.reduce((s: number, u: any) => s + u.reTaxMonth,      0);
      const totOther = units.reduce((s: number, u: any) => s + u.otherMonth,      0);
      const totGross = units.reduce((s: number, u: any) => s + u.grossRentTotal,  0);
      const avgPerSf = totSqft > 0 ? (totBase * 12) / totSqft : null;

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];

        // Page break check (leave room for totals row)
        if (curY + ROW_H > PH - M - 30) {
          ({ page, curY } = newPage());
          curY += drawHeader(page, curY, cols, tableX, tableW);
        }

        // Alternating bg
        if (i % 2 === 1) {
          page.drawRectangle({ x: tableX, y: py(curY + ROW_H), width: tableW, height: ROW_H, color: C_ALT });
        }

        let cx = tableX;
        for (const col of cols) {
          const val  = cellVal(col.header, unit, tenantMeta);
          const fs   = 8;
          const useBold = col.header === "Tenant" && !unit.isVacant;
          const tw   = (useBold ? fontBold : font).widthOfTextAtSize(val, fs);
          const tx   = col.align === "right" ? cx + col.width - 4 - tw : cx + 4;
          page.drawText(val, {
            x: tx, y: py(curY + ROW_H - 5),
            size: fs,
            font: useBold ? fontBold : font,
            color: unit.isVacant ? C_MUTED : C_DARK,
          });
          cx += col.width;
        }
        page.drawLine({ start: { x: tableX, y: py(curY + ROW_H) }, end: { x: tableX + tableW, y: py(curY + ROW_H) }, thickness: 0.2, color: C_LINE });
        curY += ROW_H;
      }

      // Totals row
      if (curY + ROW_H + 4 > PH - M - 10) {
        ({ page, curY } = newPage());
      }
      page.drawLine({ start: { x: tableX, y: py(curY + 1) }, end: { x: tableX + tableW, y: py(curY + 1) }, thickness: 1.5, color: C_DARK });
      page.drawRectangle({ x: tableX, y: py(curY + ROW_H + 1), width: tableW, height: ROW_H, color: C_HBKG });
      const totalVals: Record<string, string> = {
        "Tenant":       "Totals",
        "Sq Ft":        sqftFmt(totSqft),
        "Base Rent/mo": totBase  ? money(totBase)  : "—",
        "Annual $/sf":  avgPerSf ? `$${avgPerSf.toFixed(2)}` : "—",
        "CAM/mo":       totCAM   ? money(totCAM)   : "—",
        "RET/mo":       totRET   ? money(totRET)   : "—",
        "Other/mo":     totOther ? money(totOther) : "—",
        "Gross/mo":     totGross ? money(totGross) : "—",
      };
      let cx2 = tableX;
      for (const col of cols) {
        const val = totalVals[col.header] || "";
        const tw  = fontBold.widthOfTextAtSize(val, 8);
        const tx  = col.align === "right" ? cx2 + col.width - 4 - tw : cx2 + 4;
        page.drawText(val, { x: tx, y: py(curY + ROW_H - 4), size: 8, font: fontBold, color: C_DARK });
        cx2 += col.width;
      }

      // ── Floorplan page ──────────────────────────────────────────────────────
      const fpPath = path.join(process.cwd(), "public", "floorplans", `${code}.jpg`);
      if (fs.existsSync(fpPath)) {
        const imgBytes = fs.readFileSync(fpPath);
        const img      = await pdfDoc.embedJpg(imgBytes);
        const dims     = img.scale(1);

        const { page: fpPage } = newPage();
        fpPage.drawText(`${name} — Floor Plan`, { x: M, y: py(M + 18), size: 13, font: fontBold, color: C_DARK });

        const availW = PW - 2 * M;
        const availH = PH - 2 * M - 36;
        const ROTATE_90_CW_CODES = new Set(["3610", "3620", "4050"]);
        if (ROTATE_90_CW_CODES.has(code)) {
          // Rotated 90° clockwise: visible width = original height, visible height = original width.
          const scale = Math.min(availW / dims.height, availH / dims.width);
          const drawW = dims.width  * scale;
          const drawH = dims.height * scale;
          // pdf-lib rotates around the un-rotated bottom-left at (x, y).
          // After -90°, the image's visible bottom-left is at (x, y - drawW).
          fpPage.drawImage(img, {
            x: M + (availW - drawH) / 2,
            y: M + 36 + (availH - drawW) / 2 + drawW,
            width: drawW,
            height: drawH,
            rotate: degrees(-90),
          });
        } else {
          const scale  = Math.min(availW / dims.width, availH / dims.height);
          const drawW  = dims.width  * scale;
          const drawH  = dims.height * scale;
          fpPage.drawImage(img, {
            x: M + (availW - drawW) / 2,
            y: M + 36 + (availH - drawH) / 2,
            width: drawW, height: drawH,
          });
        }
      }
    }

    const pdfBytes  = await pdfDoc.save();
    const safeName  = reportTitle.replace(/[^a-z0-9\-_. ]/gi, "_");

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Status report error:", err);
    return new NextResponse("Failed to generate report", { status: 500 });
  }
}
