// The emails a tenant gets about a conference room request, in the same look
// as the service request emails (lib/maintenance/confirmationEmail.ts): on
// submit, and when staff approve or decline it. The old confirmation promised
// "another email once it's approved", and none was ever sent.

import { shell, textOf, SUBMIT_URL, type Shell } from "@/lib/maintenance/confirmationEmail";
import type { Reservation } from "./storage";

export const RESERVE_URL = "https://kormancommercial.com/reserve";

export function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function prettyTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

const detailsOf = (r: Reservation): [string, string][] => [
  ["Room", [r.roomLabel, r.propertyName].filter(Boolean).join(" · ")],
  ["Date", prettyDate(r.date)],
  ["Time", `${prettyTime(r.startTime)} – ${prettyTime(r.endTime)}`],
  ["Reference", r.id],
];

function render(s: Shell, first: string) {
  return { subject: s.subject, html: shell(s), text: textOf(s, first) };
}

export function reservationReceivedEmail(r: Reservation) {
  const first = r.contactFirstName?.trim() ?? "";
  return render({
    propertyCode: r.propertyCode, subject: `Reservation request received — ${r.roomLabel}, ${r.propertyName}`,
    eyebrow: "Conference Room Request",
    hello: first ? `Thanks, ${first}.` : "Thank you.", accent: "We’ve got it.",
    sub: "We’ll review it and email you once it’s confirmed.",
    details: detailsOf(r), boxLabel: "Purpose", boxText: r.purpose ?? "", emergency: false,
  }, first);
}

export function reservationDecisionEmail(r: Reservation) {
  const first = r.contactFirstName?.trim() ?? "";
  const ok = r.status === "Approved";
  return render(ok
    ? {
      propertyCode: r.propertyCode, subject: `Your reservation is confirmed — ${r.roomLabel}, ${prettyDate(r.date)}`,
      eyebrow: "Reservation Confirmed",
      hello: first ? `You’re booked, ${first}.` : "You’re booked.", accent: "",
      sub: "Your conference room reservation is confirmed for the time below.",
      details: detailsOf(r), boxLabel: "Purpose", boxText: r.purpose ?? "", emergency: false,
    }
    : {
      propertyCode: r.propertyCode, subject: `About your reservation request — ${r.roomLabel}, ${prettyDate(r.date)}`,
      eyebrow: "Reservation Request",
      hello: first ? `Sorry, ${first}.` : "Sorry.", accent: "That time isn’t available.",
      sub: "We can’t confirm the room for the time below. Please request another time.",
      details: detailsOf(r), boxLabel: "", boxText: "", emergency: false,
      button: { label: "Request another time", url: RESERVE_URL },
    }, first);
}

export { SUBMIT_URL };
