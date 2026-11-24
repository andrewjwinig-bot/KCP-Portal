// The K-1 emails' HTML, in the same look as the tenant emails (owner, 11/2026:
// "would the K1 email be the same thing?") — always the KORMAN logo: an
// investor holds partnerships, not a suite. Server-only by use (the share
// route), kept out of k1ShareEmail.ts so the client confirm does not bundle
// the email shell.
//
// The WORDS are still k1ShareEmail's: the same opening, PIN line and closing,
// laid into the shell. Only the canonical wording gets this HTML; an edited
// draft goes as the plain text that was read, as before.

import { shell, type Shell } from "@/lib/maintenance/confirmationEmail";
import { greeting, type K1ShareEmailInput } from "./k1ShareEmail";
import { taxFormNoun } from "./taxForm";

const noun = (codes: string[] | undefined, n: number) => {
  // "Schedule K-1" reads as "K-1" in a headline; "Schedule E" keeps its name.
  const f = taxFormNoun(codes ?? [], n);
  return f.replace(/^Schedule K-1/, "K-1");
};

export function k1LinkHtml(i: K1ShareEmailInput): string {
  const many = i.documentCount > 1;
  const who = i.onBehalf ? i.ownerName.trim() : "";
  const what = many ? `${i.documentCount} ${noun(i.propertyCodes, 2)}` : noun(i.propertyCodes, 1);
  const s: Shell = {
    propertyCode: null, kormanLogo: true,
    subject: "",
    eyebrow: `${i.taxYear} ${taxFormNoun(i.propertyCodes ?? [], many ? 2 : 1)}`,
    hello: greeting(i.greetNames).replace(/,$/, "."),
    accent: who ? `${who}'s ${what} ${many ? "are" : "is"} ready.` : `Your ${what} ${many ? "are" : "is"} ready.`,
    sub: many
      ? `One secure link covers every partnership ${who ? "they hold" : "you hold"} an interest in.`
      : `For ${i.propertyName}, tax year ${i.taxYear}.`,
    details: [],
    boxLabel: "", boxText: "", emergency: false,
    button: { label: many ? `View the ${noun(i.propertyCodes, 2)}` : `View the ${noun(i.propertyCodes, 1)}`, url: i.url },
    footNote: `You'll be asked for a 6-digit access PIN. It arrives in a separate email, just after this one. This link is private to ${who || "you"}; if you need a copy sent elsewhere or have any trouble opening the files, just reply.`,
  };
  return shell(s);
}

export function k1PinHtml(i: { ownerName: string; pin: string; greetNames?: string[]; onBehalf?: boolean }): string {
  const who = i.onBehalf ? i.ownerName.trim() : "";
  const s: Shell = {
    propertyCode: null, kormanLogo: true,
    subject: "",
    eyebrow: "Investor Portal",
    hello: greeting(i.greetNames?.length ? i.greetNames : [i.ownerName]).replace(/,$/, "."),
    accent: "Here's your PIN.",
    sub: who
      ? `The 6-digit PIN for ${who}'s secure investor portal link we've just sent you.`
      : "The 6-digit PIN for the secure investor portal link we've just sent you.",
    details: [], boxLabel: "", boxText: "", emergency: false,
    code: { label: "Access PIN", value: i.pin },
    footNote: "It stays the same each time you visit, so keep it somewhere you can find it. If you weren't expecting this, let us know, and don't share the PIN with anyone.",
  };
  return shell(s);
}
