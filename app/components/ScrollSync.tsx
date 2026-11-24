"use client";
// Stacked statement cards (a section per card, then Total Operating Expenses /
// NOI strips) each scroll sideways on a narrow window. Scrolled on their own,
// the columns stop lining up and every strip carries its own scrollbar — owner:
// "there's no data to slide to … it's just distracting". Any scroller marked
// `data-scroll-group="<name>"` now moves with every other one in its group, so
// the strips can hide their bar (`.quiet-scroll`) and follow the section above.
import { useEffect } from "react";

export function ScrollSync() {
  useEffect(() => {
    let syncing = false;
    const onScroll = (e: Event) => {
      if (syncing) return;
      const el = e.target as HTMLElement | null;
      const group = el?.dataset?.scrollGroup;
      if (!el || !group) return;
      syncing = true;
      for (const other of Array.from(document.querySelectorAll<HTMLElement>(`[data-scroll-group="${group}"]`))) {
        if (other !== el && other.scrollLeft !== el.scrollLeft) other.scrollLeft = el.scrollLeft;
      }
      requestAnimationFrame(() => { syncing = false; });
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  return null;
}
