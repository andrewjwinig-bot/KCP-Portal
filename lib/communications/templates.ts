// Tenant Communications — the Interplex tenant emails Greg sends from the
// portal (owner, 11/2026: "add all these to Gregs page … he can send all these
// from the portal"; "remove the text from the body of the email just use these
// HTMLS and thats it. and the subject line").
//
// Each email IS its graphic: two hosted images with a LIVE HTML button between
// them, sitting inside the graphic's callout box (an image cannot hold a
// clickable button, and Outlook desktop stretches anything but a fixed-size
// table cell — so the button is a 176 × 41 table, white Arial on navy). No
// greeting, no paragraph, no signature: the subject line and the graphic.
//
// Pure (no server-only): the page's preview and the send build the SAME HTML.
//
// A BUILDING NOTICE (fire alarm testing, window cleaning, a power outage, an
// elevator out of service) is the same graphic split at its header, with the
// schedule Greg enters laid between the halves as HTML (`schedule.ts`) and the
// request button inside it.
//
// The graphics are Claude-built PNGs in `public/site/email/tenant/`, served
// from kormancommercial.com (the sending domain) like the email signature.
// To change one, re-render it and replace `<id>-top.png` / `<id>-bottom.png`;
// `topHeight` / `bottomHeight` are their display heights (half the 1200px-wide
// files), and the button row is always 42px.

import { scheduleHtml, scheduleText, type ScheduleRow, type ScheduleSpec } from "./schedule";

export type TemplateKind = "seasonal" | "weather" | "notice";

export type TenantTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  /** What the subject defaults to; weather alerts get dates typed in. */
  subject: string;
  /** Short line for the page. */
  blurb: string;
  button: { label: string; width: number };
  topHeight: number;
  bottomHeight: number;
  /** Alt text — what a reader with images blocked sees. */
  altTop: string;
  altBottom: string;
  /** When to send, each year: month 1–12, day of month. The prompt shows from
   *  `remindFrom` and stays until it is sent that season. Several windows for
   *  work done more than once a year (window cleaning: spring and fall). */
  schedule?: SendWindow | SendWindow[];
  /** A scheduled-work notice: Greg enters building + dates; no sliced button. */
  work?: ScheduleSpec;
};

export type SendWindow = { remindFrom: { month: number; day: number }; due: { month: number; day: number } };
const windowsOf = (t: TenantTemplate): SendWindow[] => (!t.schedule ? [] : Array.isArray(t.schedule) ? t.schedule : [t.schedule]);

export const REQUEST_URL = "https://kormancommercial.com/site/maintenance";
export const IMAGE_BASE = "https://kormancommercial.com/site/email/tenant";

export const TENANT_TEMPLATES: TenantTemplate[] = [
  {
    id: "winter-tips", name: "Winter Tips", kind: "seasonal",
    subject: "Winter Tips + Request Motion-Sensor Lighting",
    blurb: "Nine habits to stay warm and cut energy costs, plus how to request motion-sensor lighting and the space heater rule.",
    button: { label: "Submit a request", width: 176 }, topHeight: 580, bottomHeight: 1231,
    altTop: "Neshaminy Interplex Winter Efficiency Guide. Warm office, lighter footprint. Want motion-sensor lighting in your suite? Submit a request and we'll see if your suite is a good fit.",
    altBottom: "Nine everyday habits for a greener winter, including reporting leaky or dripping faucets. No space heaters: prohibited by the Bensalem Fire Marshal and Property Management.",
    schedule: { remindFrom: { month: 11, day: 1 }, due: { month: 11, day: 15 } },
  },
  {
    id: "summer-tips", name: "Summer Tips", kind: "seasonal",
    subject: "Summer Tips + Request Motion-Sensor Lighting",
    blurb: "Nine habits to stay cool and cut energy costs, plus how to request motion-sensor lighting and a reminder not to prop doors.",
    button: { label: "Submit a request", width: 176 }, topHeight: 580, bottomHeight: 1212,
    altTop: "Neshaminy Interplex Summer Efficiency Guide. Cool office, lighter footprint. Want motion-sensor lighting in your suite? Submit a request and we'll see if your suite is a good fit.",
    altBottom: "Nine everyday habits for a cooler, more efficient summer, including reporting leaky or dripping faucets. Please do not prop entry doors.",
    schedule: { remindFrom: { month: 5, day: 15 }, due: { month: 6, day: 1 } },
  },
  {
    id: "cold-alert", name: "Extreme Cold Alert", kind: "weather",
    subject: "Cold Weather Alert",
    blurb: "Send ahead of a deep freeze: leave the heat on low overnight, watch for frozen pipes, still no space heaters.",
    button: { label: "Report a problem", width: 176 }, topHeight: 600, bottomHeight: 832,
    altTop: "Cold weather alert: extreme cold is on the way. No heat or a leak? Report it right away.",
    altBottom: "Leave the heat on low overnight, keep heaters clear, keep doors shut, watch for frozen pipes, watch for ice. Space heaters are still prohibited.",
  },
  {
    id: "heat-alert", name: "Heat Wave Alert", kind: "weather",
    subject: "Heat Wave Alert",
    blurb: "Send ahead of extreme heat: keep the airflow on all day, close blinds, report AC trouble early.",
    button: { label: "Report a problem", width: 176 }, topHeight: 600, bottomHeight: 813,
    altTop: "Hot weather alert: a heat wave is on the way. Suite too warm? Report it right away.",
    altBottom: "Keep airflow on all day, close blinds, keep vents clear, cut extra heat, watch for drips, and don't prop entry doors.",
  },
  {
    id: "snow-alert", name: "Snow & Ice Alert", kind: "weather",
    subject: "Winter Storm Alert",
    blurb: "Send ahead of a snow or ice storm: watch email for closures, park in marked spaces, keep fire lanes clear.",
    button: { label: "Report a problem", width: 176 }, topHeight: 600, bottomHeight: 813,
    altTop: "Winter storm alert: snow and ice are on the way. Icy walkway or entrance? Report it right away.",
    altBottom: "Check your email before heading in, park in marked spaces only, use cleared paths, wipe your feet, and report leaks. Keep fire lanes clear.",
  },
  {
    id: "storm-alert", name: "Severe Storm & Outage Alert", kind: "weather",
    subject: "Severe Weather Alert",
    blurb: "Send ahead of severe storms: back up work, unplug electronics, take the stairs, avoid downed wires.",
    button: { label: "Report a problem", width: 176 }, topHeight: 600, bottomHeight: 832,
    altTop: "Severe weather alert: storms are on the way. Storm damage? Report it right away. For life-threatening emergencies, call 911.",
    altBottom: "Save and back up your work, unplug sensitive electronics, take the stairs, keep a flashlight handy, and report storm damage. Avoid downed wires and call 911.",
  },
  {
    // Budgeted in MAY in the JV III and NI LLC Building Maintenance tabs
    // (Recurring — Fire Alarm Inspection; Kor Center B and C carry none).
    // The buildings are the ones Greg's May schedule covered.
    id: "fire-alarm", name: "Fire Alarm Testing", kind: "notice",
    subject: "Annual Fire Alarm Testing",
    blurb: "The annual testing, one building at a time, budgeted for May. Pick each building's date and time.",
    button: { label: "Submit a request", width: 176 }, topHeight: 379, bottomHeight: 675,
    schedule: { remindFrom: { month: 4, day: 1 }, due: { month: 4, day: 20 } },
    altTop: "Annual fire alarm testing is coming. Our fire alarm vendor will be on site for the required annual testing, working one building at a time.",
    altBottom: "What to expect: sirens and strobes in short bursts; technicians will stop into your suite to check the alarm equipment; elevators may pause; share the schedule with your office. A real fire is never a test: if you see smoke or fire at any time, evacuate and call 911.",
    work: {
      title: "Testing schedule", columns: [{ label: "Date", kind: "date" }, { label: "Time", kind: "time" }], order: "date",
      subjectPrefix: "Annual Fire Alarm Testing", defaultBuildings: ["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0"],
      note: "Locked suite, or a question about your date? Submit a request and we\u2019ll coordinate with the vendor.",
    },
  },
  {
    // Budgeted twice a year — APRIL and OCTOBER (Building 1 in March) — in the
    // JV III and NI LLC Building Maintenance tabs (Contract — Window Cleaning),
    // every building including Kor Center A, B and C.
    id: "window-cleaning", name: "Window Cleaning", kind: "notice",
    subject: "Window Cleaning",
    blurb: "Inside and outside, spring and fall. Pick each building's outside and inside weeks.",
    button: { label: "Submit a request", width: 176 }, topHeight: 379, bottomHeight: 675,
    schedule: [
      { remindFrom: { month: 3, day: 1 }, due: { month: 3, day: 15 } },
      { remindFrom: { month: 9, day: 15 }, due: { month: 10, day: 1 } },
    ],
    altTop: "Window cleaning is coming. Crews will clean the inside and outside windows across the park, building by building.",
    altBottom: "What to expect: clear the sills and raise the blinds; crews will need your suite; expect lifts and ladders outside; dates are approximate. Please don't walk or park under lifts and ladders while they work.",
    work: {
      title: "Building", columns: [{ label: "Outside", kind: "week" }, { label: "Inside", kind: "week" }], order: "building",
      subjectPrefix: "Window Cleaning", defaultBuildings: ["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"],
      note: "Locked suite, or a question about your week? Submit a request and we\u2019ll coordinate with the crew.",
    },
  },
  {
    id: "power-outage", name: "Power Outage", kind: "notice",
    subject: "Power Outage",
    blurb: "When a building loses power. Pick the building, when it went out and the latest estimate.",
    button: { label: "Report a problem", width: 176 }, topHeight: 379, bottomHeight: 675,
    altTop: "Power is out in your building. We're working with the utility to get it back on as quickly as possible.",
    altBottom: "What to do: save your work and shut down; unplug sensitive electronics; elevators are out, so take the stairs; if something isn't working once power is back, submit a request. Stay clear of downed wires: never touch a downed line, keep away and call 911.",
    work: {
      title: "Building", columns: [{ label: "Out since", kind: "text" }, { label: "Expected back", kind: "text" }], order: "building",
      subjectPrefix: "Power Outage", subjectBy: "buildings",
      note: "Something still not working once power is back? Submit a request and we\u2019ll come check it.",
    },
  },
  {
    id: "elevator", name: "Elevator Out of Service", kind: "notice",
    subject: "Elevator Out of Service",
    blurb: "When an elevator is down for repair. Pick the building, which elevator and when it's expected back.",
    button: { label: "Submit a request", width: 176 }, topHeight: 379, bottomHeight: 675,
    altTop: "An elevator in your building is out of service while it's repaired.",
    altBottom: "What to do: please use the stairs or another elevator; if you or a visitor can't take the stairs, submit a request; hold off on big deliveries; share this with your office. Stuck in an elevator? Press the emergency call button inside the car or call 911.",
    work: {
      title: "Building", columns: [{ label: "Elevator", kind: "text" }, { label: "Out since", kind: "date" }, { label: "Expected back", kind: "text" }], order: "building",
      subjectPrefix: "Elevator Out of Service", subjectBy: "buildings",
      note: "Can\u2019t take the stairs, or have a delivery coming? Submit a request and we\u2019ll help.",
    },
  },
];

export function templateById(id: string): TenantTemplate | undefined {
  return TENANT_TEMPLATES.find((t) => t.id === id);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email: the graphic, sliced around a live button. `imageBase` lets the
 *  page preview load the images from wherever the portal is served. */
export function renderTenantEmail(t: TenantTemplate, imageBase = IMAGE_BASE, work?: { rows: ScheduleRow[]; building?: string }): { html: string; text: string } {
  if (t.work) return renderWorkEmail(t, t.work, imageBase, work?.rows ?? [], work?.building);
  const img = (part: "top" | "bottom", h: number, alt: string) =>
    `<img src="${imageBase}/${t.id}-${part}.png" width="600" height="${h}" alt="${esc(alt)}" style="display:block;width:600px;height:${h}px;border:0;outline:none;text-decoration:none;">`;
  const cell = (w: number, bg: string) => `<td width="${w}" style="width:${w}px;background:${bg};font-size:0;line-height:0;">&nbsp;</td>`;
  const restWidth = 600 - 36 - 6 - 26 - 36;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;">
<tr><td colspan="5" style="padding:0;line-height:0;font-size:0;">${img("top", t.topHeight, t.altTop)}</td></tr>
<tr>${cell(36, "#ffffff")}${cell(6, "#838906")}${cell(26, "#f1f3d6")}
<td width="${restWidth}" height="42" valign="top" style="width:${restWidth}px;height:42px;background:#f1f3d6;padding:0;mso-line-height-rule:exactly;line-height:42px;">
<table role="presentation" width="${t.button.width}" height="41" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:${t.button.width}px;height:41px;"><tr>
<td width="${t.button.width}" height="41" bgcolor="#18468b" align="center" valign="middle" style="width:${t.button.width}px;height:41px;background:#18468b;mso-line-height-rule:exactly;line-height:41px;padding:0;">
<a href="${REQUEST_URL}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:41px;display:block;"><font color="#ffffff">${esc(t.button.label)} &rarr;</font></a>
</td></tr></table>
</td>${cell(36, "#ffffff")}</tr>
<tr><td colspan="5" style="padding:0;line-height:0;font-size:0;"><a href="${REQUEST_URL}" target="_blank">${img("bottom", t.bottomHeight, t.altBottom)}</a></td></tr>
</table></body></html>`;
  // The plain-text twin every email needs: the graphic's words and the link.
  const text = `${t.altTop}\n\n${t.button.label}: ${REQUEST_URL}\n\n${t.altBottom}\n`;
  return { html, text };
}

/** A scheduled-work notice: header image, the schedule (HTML), the rest of
 *  the graphic. The suite's own building is highlighted when known. */
function renderWorkEmail(t: TenantTemplate, spec: ScheduleSpec, imageBase: string, rows: ScheduleRow[], building?: string): { html: string; text: string } {
  const img = (part: "top" | "bottom", h: number, alt: string) =>
    `<img src="${imageBase}/${t.id}-${part}.png" width="600" height="${h}" alt="${esc(alt)}" style="display:block;width:600px;height:${h}px;border:0;outline:none;text-decoration:none;">`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;">
<tr><td style="padding:0;line-height:0;font-size:0;">${img("top", t.topHeight, t.altTop)}</td></tr>
${scheduleHtml(spec, rows, { building, requestUrl: REQUEST_URL, buttonLabel: t.button.label })}
<tr><td style="padding:0;line-height:0;font-size:0;"><a href="${REQUEST_URL}" target="_blank">${img("bottom", t.bottomHeight, t.altBottom)}</a></td></tr>
</table></body></html>`;
  const text = `${t.altTop}\n\n${scheduleText(spec, rows, building)}\n\n${t.button.label}: ${REQUEST_URL}\n\n${t.altBottom}\n`;
  return { html, text };
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export type DueState = { template: TenantTemplate; dueISO: string; overdue: boolean; seasonStartISO: string };

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The season an email belongs to as of `todayISO`: the latest of its
 *  reminder starts on or before today (this year's, else last year's). */
function currentWindow(t: TenantTemplate, todayISO: string): { start: string; w: SendWindow } | null {
  const y = Number(todayISO.slice(0, 4));
  let best: { start: string; w: SendWindow } | null = null;
  for (const w of windowsOf(t)) for (const yy of [y, y - 1]) {
    const start = iso(yy, w.remindFrom.month, w.remindFrom.day);
    if (start <= todayISO && (!best || start > best.start)) best = { start, w };
  }
  return best;
}
export function seasonStart(t: TenantTemplate, todayISO: string): string | null {
  return currentWindow(t, todayISO)?.start ?? null;
}

/** Emails that should be sent now: inside a window (from its reminder start
 *  to 60 days after it) and not sent since that start. */
export function dueTemplates(todayISO: string, lastSentById: Record<string, string | undefined>): DueState[] {
  const out: DueState[] = [];
  for (const t of TENANT_TEMPLATES) {
    const cur = currentWindow(t, todayISO);
    if (!cur) continue;
    const { start, w } = cur;
    const windowEnd = new Date(`${start}T12:00:00Z`);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 60);
    if (todayISO > windowEnd.toISOString().slice(0, 10)) continue;
    const last = lastSentById[t.id];
    if (last && last.slice(0, 10) >= start) continue;
    const sy = Number(start.slice(0, 4));
    const dueISO = iso(w.due.month < w.remindFrom.month ? sy + 1 : sy, w.due.month, w.due.day);
    out.push({ template: t, dueISO, overdue: todayISO > dueISO, seasonStartISO: start });
  }
  return out;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function scheduleLabel(t: TenantTemplate): string | null {
  const ws = windowsOf(t);
  if (!ws.length) return null;
  return `Send by ${ws.map((w) => `${MONTH_NAMES[w.due.month - 1]} ${w.due.day}`).join(" and ")} each year`;
}
