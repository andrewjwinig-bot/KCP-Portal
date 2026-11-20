"use client";
// Randy's orientation, on his dashboard (owner: "maybe we can add it as a
// resource to his portal page"): how far through the modules he is, the next
// one, and the handbook to download.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Download, GraduationCap } from "lucide-react";
import { MODULES, CHECKLIST } from "@/lib/onboarding/modules";

type Progress = { modules: Record<string, unknown>; checklist: Record<string, unknown> };

export default function OrientationCard() {
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => {
    fetch("/api/onboarding", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => j && setP(j.progress)).catch(() => {});
  }, []);
  const done = p ? MODULES.filter((m) => p.modules[m.id]).length : 0;
  const next = p ? MODULES.find((m) => !p.modules[m.id]) : MODULES[0];
  const items = CHECKLIST.flatMap((g) => g.items);
  const ticked = p ? items.filter((i) => p.checklist[i.id]).length : 0;
  const pct = Math.round((done / MODULES.length) * 100);
  return (
    <section className="card" style={{ display: "grid", gap: 14, padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <GraduationCap size={24} strokeWidth={1.75} style={{ color: "var(--brand)" }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Your Orientation</div>
            <div style={{ color: "var(--muted)", fontSize: "var(--fs-14)" }}>
              {done} of {MODULES.length} modules done · 90-day plan {ticked} of {items.length}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href="/api/onboarding/handbook" style={{ textDecoration: "none" }}><Download size={16} strokeWidth={1.75} /> Handbook</a>
          <Link className="btn primary" style={{ textDecoration: "none" }} href={next ? `/onboarding?m=${next.id}` : "/onboarding"}>
            {done === 0 ? "Start Orientation" : next ? "Continue" : "Review Modules"}
          </Link>
        </div>
      </div>
      <div aria-hidden style={{ height: 6, borderRadius: 999, background: "var(--hairline)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: done === MODULES.length ? "var(--c-067647)" : "var(--brand)" }} />
      </div>
      <div style={{ fontSize: "var(--fs-14)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        {next ? <>Next up: <strong style={{ color: "var(--text)" }}>{next.title}</strong> · {next.minutes} min</>
          : <><CircleCheck size={16} strokeWidth={1.75} style={{ color: "var(--c-067647)" }} /> Every module done — the handbook and glossary stay here for reference</>}
      </div>
    </section>
  );
}
