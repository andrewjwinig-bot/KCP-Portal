// Building notices — fire alarm testing, window cleaning, a power outage, an
// elevator out of service (owner, 11/2026: "he just needs to be able to
// select a building and the dates"). Greg picks a building and its dates per
// row; the email lays them out as a real table between the graphic's header
// and its "what to do" panel. The draft goes to his distribution lists from
// Outlook, so the "Your building" box appears only when he picks a building
// to highlight (one draft per building's list).
//
// Pure: the page's preview and the send render the same HTML.

export const BUILDINGS: { code: string; label: string }[] = [
  { code: "3610", label: "Building 1" },
  { code: "3620", label: "Building 2" },
  { code: "3640", label: "Building 4" },
  { code: "4050", label: "Building 5" },
  { code: "4060", label: "Building 6" },
  { code: "4070", label: "Building 7" },
  { code: "4080", label: "Building 8" },
  { code: "40A0", label: "Kor Center A" },
  { code: "40B0", label: "Kor Center B" },
  { code: "40C0", label: "Kor Center C" },
];
/** A row for the whole park (make-up day, "anything missed"). Never highlighted. */
export const ALL_BUILDINGS = "ALL";

export function buildingLabel(code: string): string {
  if (code === ALL_BUILDINGS) return "All buildings";
  return BUILDINGS.find((b) => b.code === code)?.label ?? code;
}

/** The building a suite sits in: The Office Works (4900) is inside Building 5. */
export function buildingOfProperty(propertyCode: string): string {
  const c = propertyCode.toUpperCase();
  return c === "4900" ? "4050" : c;
}

/** "text" is typed as-is ("Today, 2 PM", "Main lobby", "Unknown"). */
export type ColumnKind = "date" | "week" | "time" | "text";
export type ScheduleColumn = { label: string; kind: ColumnKind };
export type ScheduleSpec = {
  title: string;
  columns: ScheduleColumn[];
  /** "date": one line per row, in date order (fire alarm). "building": one
   *  line per building, its rows' dates joined (window cleaning). */
  order: "date" | "building";
  /** Subject built from the dates (or the buildings) until Greg types his own. */
  subjectPrefix: string;
  /** "buildings": "Power Outage: Building 5" — for an alert with no fixed dates. */
  subjectBy?: "dates" | "buildings";
  /** The rows a new draft starts with (the buildings the work usually covers). */
  defaultBuildings?: string[];
  /** The line above the request button. */
  note: string;
};

export const TIME_OPTIONS = ["All day", "Morning", "Afternoon"];

export type ScheduleRow = { building: string; cells: string[] };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const parts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };

export function formatCell(kind: ColumnKind, value: string): string {
  if (!value) return "";
  if (kind === "time" || kind === "text") return value;
  if (!isISO(value)) return value;
  const p = parts(value);
  return kind === "week" ? `Week of ${MON[p.m - 1]} ${p.d}` : `${DOW[p.dow]}, ${MON[p.m - 1]} ${p.d}`;
}

/** Keep only rows with a known building and something filled in; cap sizes. */
export function cleanSchedule(spec: ScheduleSpec, raw: unknown): ScheduleRow[] {
  const ok = new Set([...BUILDINGS.map((b) => b.code), ALL_BUILDINGS]);
  const rows = Array.isArray(raw) ? raw : [];
  const out: ScheduleRow[] = [];
  for (const r of rows.slice(0, 60)) {
    const building = String((r as ScheduleRow)?.building ?? "").toUpperCase();
    if (!ok.has(building)) continue;
    const cells = spec.columns.map((c, i) => {
      const v = String(((r as ScheduleRow)?.cells ?? [])[i] ?? "").trim().slice(0, 40);
      if (c.kind === "time" || c.kind === "text") return v.replace(/[<>\r\n]/g, "");
      return isISO(v) ? v : "";
    });
    if (cells.some(Boolean)) out.push({ building, cells });
  }
  return out;
}

export type ScheduleLine = { building: string; label: string; cells: string[] };

/** The table as it reads: date order, or one line per building. */
export function scheduleLines(spec: ScheduleSpec, rows: ScheduleRow[]): ScheduleLine[] {
  if (spec.order === "date") {
    const dateCol = spec.columns.findIndex((c) => c.kind === "date" || c.kind === "week");
    const sorted = [...rows].sort((a, b) => (a.cells[dateCol] || "9999").localeCompare(b.cells[dateCol] || "9999"));
    return sorted.map((r) => ({ building: r.building, label: buildingLabel(r.building), cells: spec.columns.map((c, i) => formatCell(c.kind, r.cells[i])) }));
  }
  const order = [...BUILDINGS.map((b) => b.code), ALL_BUILDINGS];
  const by = new Map<string, ScheduleRow[]>();
  for (const r of rows) by.set(r.building, [...(by.get(r.building) ?? []), r]);
  return order.filter((b) => by.has(b)).map((b) => ({
    building: b,
    label: buildingLabel(b),
    cells: spec.columns.map((c, i) => {
      const vals = [...new Set(by.get(b)!.map((r) => r.cells[i]).filter(Boolean))].sort();
      return vals.map((v) => formatCell(c.kind, v)).join(" and ");
    }),
  }));
}

/** "May 4 – 15" / "Oct 19 – 30" / "Oct 26 – Nov 6", Friday-ending for weeks. */
export function dateRangeLabel(spec: ScheduleSpec, rows: ScheduleRow[]): string {
  const days: string[] = [];
  spec.columns.forEach((c, i) => {
    if (c.kind !== "date" && c.kind !== "week") return;
    for (const r of rows) {
      const v = r.cells[i];
      if (!isISO(v)) continue;
      days.push(v);
      if (c.kind === "week") { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 4); days.push(d.toISOString().slice(0, 10)); }
    }
  });
  if (!days.length) return "";
  days.sort();
  const a = parts(days[0]), b = parts(days[days.length - 1]);
  if (days[0] === days[days.length - 1]) return `${MON[a.m - 1]} ${a.d}`;
  return a.m === b.m ? `${MON[a.m - 1]} ${a.d} – ${b.d}` : `${MON[a.m - 1]} ${a.d} – ${MON[b.m - 1]} ${b.d}`;
}

export function scheduleSubject(spec: ScheduleSpec, rows: ScheduleRow[]): string {
  if (spec.subjectBy === "buildings") {
    const order = [...BUILDINGS.map((b) => b.code), ALL_BUILDINGS];
    const bs = order.filter((b) => rows.some((r) => r.building === b)).map(buildingLabel);
    return bs.length ? `${spec.subjectPrefix}: ${bs.length > 3 ? `${bs.slice(0, 3).join(", ")} + ${bs.length - 3} more` : bs.join(", ")}` : spec.subjectPrefix;
  }
  const range = dateRangeLabel(spec, rows);
  return range ? `${spec.subjectPrefix}: ${range}` : spec.subjectPrefix;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "Jost,'Century Gothic',Futura,Arial,Helvetica,sans-serif";
const BODY = "Arial,Helvetica,sans-serif";

/** The middle of the email: the tenant's own building, the schedule, and the
 *  request button. 600px wide, tables and inline styles only. */
export function scheduleHtml(spec: ScheduleSpec, rows: ScheduleRow[], opts: { building?: string; requestUrl: string; buttonLabel: string }): string {
  const lines = scheduleLines(spec, rows);
  const mine = opts.building ? lines.filter((l) => l.building === opts.building) : [];
  const cap = (t: string, color = "#6c7890") => `<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(t)}</div>`;

  const yours = mine.length ? `
<tr><td style="padding:26px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="6" style="width:6px;background:#838906;font-size:0;line-height:0;">&nbsp;</td>
<td style="background:#f1f3d6;padding:20px 24px;">
${cap("Your building", "#6d7205")}
<div style="font-family:${FONT};font-size:26px;font-weight:bold;color:#0e2c5a;margin-top:6px;line-height:1.15;">${esc(mine[0].label)}</div>
${mine.map((l) => `<div style="font-family:${BODY};font-size:16px;color:#13213a;margin-top:6px;line-height:1.4;">${spec.order === "date"
  ? l.cells.filter(Boolean).map((c, i) => i === 0 ? `<b>${esc(c)}</b>` : esc(c)).join(" &nbsp;&middot;&nbsp; ")
  : spec.columns.map((c, i) => l.cells[i] ? `<span style="color:#6c7890;">${esc(c.label)}:</span> <b>${esc(l.cells[i])}</b>` : "").filter(Boolean).join(" &nbsp;&middot;&nbsp; ")}</div>`).join("")}
</td></tr></table>
</td></tr>` : "";

  const th = (t: string, align = "left") => `<td style="padding:0 0 8px;border-bottom:1px solid #dde3ec;text-align:${align};">${cap(t)}</td>`;
  const body = lines.map((l) => {
    const hi = opts.building && l.building === opts.building;
    const bg = hi ? "background:#f1f3d6;" : "";
    const td = (t: string, extra = "") => `<td style="padding:11px 8px 11px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};font-size:14px;color:#13213a;${bg}${extra}">${esc(t) || "&mdash;"}</td>`;
    return `<tr>${td(l.label, `font-weight:bold;color:#0e2c5a;padding-left:${hi ? 8 : 0}px;`)}${l.cells.map((c) => td(c, hi ? "font-weight:bold;" : "")).join("")}</tr>`;
  }).join("");

  return `
<tr><td style="padding:0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;background:#ffffff;">
${yours}
<tr><td style="padding:26px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;">
<tr>${th(spec.title)}${spec.columns.map((c) => th(c.label)).join("")}</tr>
${body}
</table>
</td></tr>
<tr><td style="padding:22px 36px 4px;font-family:${BODY};font-size:14px;color:#43506a;line-height:1.5;">${esc(spec.note)}</td></tr>
<tr><td style="padding:8px 36px 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td height="41" bgcolor="#18468b" align="center" valign="middle" style="height:41px;background:#18468b;padding:0 20px;mso-line-height-rule:exactly;line-height:41px;">
<a href="${opts.requestUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:41px;display:block;"><font color="#ffffff">${esc(opts.buttonLabel)} &rarr;</font></a>
</td></tr></table>
</td></tr>
</table></td></tr>`;
}

/** Plain-text twin of the schedule. */
export function scheduleText(spec: ScheduleSpec, rows: ScheduleRow[], building?: string): string {
  const lines = scheduleLines(spec, rows);
  const mine = building ? lines.filter((l) => l.building === building) : [];
  const fmt = (l: ScheduleLine) => `${l.label}: ${spec.columns.map((c, i) => l.cells[i] ? `${c.label} ${l.cells[i]}` : "").filter(Boolean).join(", ")}`;
  return [
    ...(mine.length ? [`Your building — ${mine.map(fmt).join("; ")}`, ""] : []),
    spec.title.toUpperCase(),
    ...lines.map(fmt),
  ].join("\n");
}
