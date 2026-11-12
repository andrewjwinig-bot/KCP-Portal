"use client";
// The row of outside systems at the top of every dashboard (lib/quickLinks.ts).
// Each is a control-height tile — the short logo mark and the name — opening
// in a new tab. Bank logins only reach the people who bank.
import { useUser } from "../components/UserProvider";
import { quickLinksFor } from "@/lib/quickLinks";

export default function QuickLinks() {
  const { user } = useUser();
  const links = quickLinksFor(user.id);
  if (!links.length) return null;
  return (
    <nav aria-label="Quick links" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {links.map((l) => (
        <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" className="quick-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.icon} alt="" width={26} height={26} />
          <span>{l.name}</span>
        </a>
      ))}
    </nav>
  );
}
