// The Office Works website's "Request a tour" form. The handoff only built a
// copyable summary; it now posts to /api/website/tour (honeypot + per-IP rate
// limit, as the Contact form), which emails the request. Pure, so it is tested
// alone.

export type TourInput = {
  program: string; name: string; company: string; email: string; phone: string;
  office: string; date: string; website: string;
};
export type TourValue = Omit<TourInput, "website">;

export type TourCheck =
  | { ok: true; spam: boolean; value: TourValue }
  | { ok: false; error: string };

/** Nancy Fox answers Office Works tour requests (owner: "she would be the one
 *  to respond to those"). OFFICE_WORKS_TOUR_TO (comma-separated) overrides. */
export const TOUR_TO_DEFAULT = "nfox@kormancommercial.com";
export function tourRecipients(env: string | undefined = process.env.OFFICE_WORKS_TOUR_TO): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [TOUR_TO_DEFAULT];
}

const PROGRAMS = ["Private office", "Virtual office", "Occasional use"];
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function checkTour(body: Record<string, unknown>): TourCheck {
  const value: TourValue = {
    program: PROGRAMS.includes(clean(body.program, 40)) ? clean(body.program, 40) : "Private office",
    name: clean(body.name, 200),
    company: clean(body.company, 200),
    email: clean(body.email, 200),
    phone: clean(body.phone, 60),
    office: clean(body.office, 40),
    date: /^\d{4}-\d{2}-\d{2}$/.test(clean(body.date, 10)) ? clean(body.date, 10) : "",
  };
  // A filled honeypot is accepted and dropped, so a bot learns nothing.
  if (clean(body.website, 200)) return { ok: true, spam: true, value };
  if (!value.name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) return { ok: false, error: "Please enter a valid email address." };
  return { ok: true, spam: false, value };
}

export function tourDateLabel(date: string): string {
  if (!date) return "Flexible";
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function tourEmailText(v: TourValue): string {
  return [
    "Tour request from The Office Works website.",
    "",
    `Program:         ${v.program}`,
    `Office:          ${v.office ? `Office ${v.office}` : "No preference"}`,
    `Preferred date:  ${tourDateLabel(v.date)}`,
    "",
    `Name:     ${v.name}`,
    ...(v.company ? [`Company:  ${v.company}`] : []),
    `Email:    ${v.email}`,
    ...(v.phone ? [`Phone:    ${v.phone}`] : []),
  ].join("\n");
}
