"use client";

import { useEffect, useRef, useState } from "react";

// The four counters under the hero. Each counts up from zero in 50 steps of
// 40 ms once the strip scrolls into view (once), as the original did.

const STATS = [
  { value: 100, suffix: "+", unit: "YEARS", description: "REAL ESTATE EXPERTISE" },
  { value: 5, suffix: "", unit: "GENERATIONS", description: "FAMILY LEADERSHIP" },
  { value: 2_000_000, suffix: "", unit: "SQUARE FEET", description: "RETAIL SPACE DEVELOPED" },
  { value: 20_000, suffix: "", unit: "HOMES", description: "DEVELOPED SINCE 1919" },
];

export default function StatsShowcase() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="w-full relative flex flex-col justify-center pt-10 pb-28 bg-slate-900 text-white" style={{ paddingBottom: 108, marginBottom: -1 }}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div className="relative" key={s.unit}>
            <Counter {...s} visible={inView} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Counter({ value, suffix, unit, description, visible }: (typeof STATS)[number] & { visible: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const step = value / 50;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(Math.min(Math.floor(step * i), value));
      if (i >= 50) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [visible, value]);
  return (
    <div className="text-center flex flex-col items-center justify-center h-full py-4">
      <div className="mb-6">
        <div className="text-5xl md:text-6xl font-light mb-2 tracking-tight">
          {n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          {suffix}
        </div>
        <div className="text-2xl font-light text-white/80">{unit}</div>
      </div>
      <div className="w-16 h-px bg-white/30 mb-6" />
      <div className="uppercase text-sm tracking-wider text-white/70">{description}</div>
    </div>
  );
}
