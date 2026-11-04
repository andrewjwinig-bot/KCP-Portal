// Who a move-out close-out goes to (owner: "i just send it to nancy to approve
// and then tanya processes the charges once approved"). The approver reviews
// the Final Bill; once approved, the charges go to Tanya, who posts them to the
// tenant's account in Skyline. `MOVEOUT_CHARGES_TO` overrides her address.

export const APPROVER = {
  office: { email: "nfox@kormancommercial.com", first: "Nancy" },
  retail: { email: "hfeldman@kormancommercial.com", first: "Harry" },
} as const;

export const MOVEOUT_CHARGES_NAME = "Tanya";
export function moveoutChargesTo(): string {
  return (process.env.MOVEOUT_CHARGES_TO || "trovkin@kormancommercial.com").trim();
}
