"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import { loadTaxChecked } from "../../tracker/tax-data";
import { PropertyDetailBody, TypePill } from "../PropertyDetail";

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id ?? "";
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const prop = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === id.toUpperCase());

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setChecked(loadTaxChecked(new Date().getFullYear()));
  }, []);

  if (!prop) {
    return (
      <main style={{ display: "grid", gap: 14 }}>
        <div style={{
          padding: "20px 24px",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--card)",
          display: "flex", flexDirection: "column", gap: 8,
          maxWidth: 480,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Property not found</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            No property matches the id <code>{id}</code>.
          </div>
          <Link
            href="/properties"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)", textDecoration: "none", marginTop: 4 }}
          >
            ← Properties
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link
          href="/properties"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none" }}
        >
          ← Properties
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>{prop.name}</h1>
          <code style={{
            background: "#0b1220", color: "#e0f0ff",
            padding: "2px 8px", borderRadius: 5,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          }}>{prop.id}</code>
          <TypePill type={prop.type} />
        </div>
      </header>

      <PropertyDetailBody prop={prop} checked={checked} />
    </main>
  );
}
