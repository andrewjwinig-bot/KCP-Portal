"use client";
// The outside systems (lib/quickLinks.ts), as LOGO TILES — the name shows on
// hover (owner: "just show the logos … without the app name"). Each opens in a
// new tab; bank logins only reach the people who bank. `card` draws them in a
// small "Quick Links" card, as the top of Drew's Work Queue's right column.
import { useUser } from "../components/UserProvider";
import { quickLinksFor } from "@/lib/quickLinks";

const SECTION: React.CSSProperties = { fontSize: "var(--fs-13)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };

export default function QuickLinks({ card = false }: { card?: boolean }) {
  const { user } = useUser();
  const links = quickLinksFor(user.id);
  if (!links.length) return null;
  const row = (
    <nav aria-label="Quick links" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {links.map((l) => (
        <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" className="quick-link" aria-label={l.name} data-tip={l.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.icon} alt="" width={30} height={30} />
        </a>
      ))}
    </nav>
  );
  if (!card) return row;
  return (
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <span style={SECTION}>Quick Links</span>
      {row}
    </section>
  );
}
